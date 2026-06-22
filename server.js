require("dotenv").config();

const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);


app.use(cors());

function checkInternalAuth(req, res, next) {
    const token = req.headers["x-internal-secret"];

    if (!token || token !== process.env.NODE_INTERNAL_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}

async function notifyKash(action, payload) {
    const response = await fetch(process.env.KASH_INTERNAL_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": process.env.KASH_INTERNAL_API_KEY,
        },
        body: JSON.stringify({
            action,
            payload,
        }),
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`Kash API error ${response.status}: ${text}`);
    }

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}


app.post(
    "/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                req.headers["stripe-signature"],
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error("Webhook signature error:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        //console.log("received webhook", event);
        try {
            switch (event.type) {
                case "checkout.session.completed":
                    await handleCheckoutCompleted(event.data.object);
                    break;

                case "customer.subscription.created":
                case "customer.subscription.updated":
                    await handleSubscriptionUpdated(event.data.object);
                    break;

                case "customer.subscription.deleted":
                    await handleSubscriptionDeleted(event.data.object);
                    break;

                case "invoice.paid":
                    await handleInvoicePaid(event.data.object);
                    break;

                case "invoice.payment_failed":
                    await handleInvoicePaymentFailed(event.data.object);
                    break;
            }

            res.json({ received: true });
        } catch (err) {
            console.error("Webhook handling error:", err);
            res.status(500).json({ error: "Webhook handling failed" });
        }
    }
);
app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});
app.use(express.json());

app.post("/stripe/cancel-subscription", checkInternalAuth, async (req, res) => {

    const { stripe_subscription_id } = req.body;

    const sub = await stripe.subscriptions.update(
        stripe_subscription_id,
        {
            cancel_at_period_end: true
        }
    );

    res.json({
        success: true,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end
    });
});

app.post("/stripe/change-subscription", checkInternalAuth, async (req, res) => {
    try {

        const {
            stripe_subscription_id,
            new_stripe_price_id
        } = req.body;

        if (!stripe_subscription_id || !new_stripe_price_id) {
            return res.status(400).json({
                error: "Missing parameters"
            });
        }

        const subscription = await stripe.subscriptions.retrieve(
            stripe_subscription_id
        );

        const itemId = subscription.items.data[0].id;

        const updated = await stripe.subscriptions.update(
            stripe_subscription_id,
            {
                proration_behavior: "create_prorations",

                items: [
                    {
                        id: itemId,
                        price: new_stripe_price_id
                    }
                ]
            }
        );

        res.json({
            success: true,
            subscription_id: updated.id,
            status: updated.status
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });
    }
});
app.post("/stripe/create-checkout-session", checkInternalAuth, async (req, res) => {
    try {
        const {
            user_id,
            shop_id,
            email,
            stripe_price_id,
            plan_code,
            billing_period
        } = req.body;

        if (!user_id || !shop_id || !email || !stripe_price_id) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: email,
            line_items: [
                {
                    price: stripe_price_id,
                    quantity: 1,
                },
            ],
            success_url: `${process.env.APP_URL}/?stripe-success=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL}/?stripe-cancel=1`,
            metadata: {
                user_id: String(user_id),
                shop_id: String(shop_id),
                plan_code: plan_code || "",
                billing_period: billing_period || "",
                stripe_price_id: stripe_price_id,
            },
            subscription_data: {
                metadata: {
                    user_id: String(user_id),
                    shop_id: String(shop_id),
                    plan_code: plan_code || "",
                    billing_period: billing_period || "",
                    stripe_price_id: stripe_price_id,
                },
            },
        });

        res.json({
            checkout_url: session.url,
            session_id: session.id,
        });
    } catch (err) {
        console.error("Create checkout error:", err);
        res.status(500).json({ error: "Unable to create checkout session" });
    }
});

app.post("/stripe/create-portal-session", checkInternalAuth, async (req, res) => {
    try {
        //console.log('portal', req.body);
        const { stripe_customer_id, return_url } = req.body;

        if (!stripe_customer_id) {
            return res.status(400).json({ error: "Missing stripe_customer_id" });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: stripe_customer_id,
            return_url: return_url || `${process.env.APP_URL}/`,
        });

        res.json({
            portal_url: session.url,
        });
    } catch (err) {
        console.error("Create portal error:", err);
        res.status(500).json({ error: "Unable to create portal session" });
    }
});

app.post("/stripe/subscription-status", checkInternalAuth, async (req, res) => {
    try {
        const { stripe_subscription_id } = req.body;

        if (!stripe_subscription_id) {
            return res.status(400).json({ error: "Missing stripe_subscription_id" });
        }

        const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);

        res.json({
            id: subscription.id,
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
        });
    } catch (err) {
        console.error("Subscription status error:", err);
        res.status(500).json({ error: "Unable to retrieve subscription status" });
    }
});


async function handleCheckoutCompleted(session) {
    const res = await notifyKash("checkout_completed", {
        stripe_checkout_session_id: session.id,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,

        user_id: session.metadata ? session.metadata.user_id : null,
        shop_id: session.metadata ? session.metadata.shop_id : null,

        plan_code: session.metadata ? session.metadata.plan_code : null,
        billing_period: session.metadata ? session.metadata.billing_period : null,
        stripe_price_id: session.metadata ? session.metadata.stripe_price_id : null,

        payment_status: session.payment_status,
    });
    console.log('handleCheckoutCompleted', res);
}
async function handleSubscriptionUpdated(subscription) {
    const sub = await stripe.subscriptions.retrieve(subscription.id, {
        expand: ["items.data.price"]
    });

    const item =
        sub.items && sub.items.data && sub.items.data.length > 0
            ? sub.items.data[0]
            : null;

    const priceId = item && item.price ? item.price.id : null;

    const currentPeriodStart = item ? item.current_period_start : null;
    const currentPeriodEnd = item ? item.current_period_end : null;

    const payload = {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        stripe_price_id: priceId,

        user_id: sub.metadata ? sub.metadata.user_id : null,
        shop_id: sub.metadata ? sub.metadata.shop_id : null,

        plan_code: sub.metadata ? sub.metadata.plan_code : null,
        billing_period: sub.metadata ? sub.metadata.billing_period : null,

        status: sub.status,

        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,

        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at
    };

    //console.log("handleSubscriptionUpdated", payload);

    const res = await notifyKash("subscription_updated", payload);
    console.log('handleSubscriptionUpdated', res);
}

async function handleSubscriptionDeleted(subscription) {
    const res = await notifyKash("subscription_deleted", {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        user_id: subscription.metadata?.user_id,
        shop_id: subscription.metadata?.shop_id,
        status: subscription.status,
        canceled_at: subscription.canceled_at,
    });
    console.log('handleSubscriptionDeleted', res);
}

async function handleInvoicePaid(invoice) {
    const res = await notifyKash("invoice_paid", {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: invoice.parent.subscription_details.subscription,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
    });
    console.log('handleInvoicePaid', res, invoice);
}

async function handleInvoicePaymentFailed(invoice) {
    const res = await notifyKash("invoice_payment_failed", {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: invoice.subscription,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
    });
    console.log('handleInvoicePaymentFailed', res);
}

app.listen(process.env.PORT, () => {
    console.log(`Stripe proxy running on port ${process.env.PORT}`);
});