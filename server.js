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
/*
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
    console.log("kash response", text);

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}*/

async function notifyInternal(url, key, action, payload) {
    console.log("notifyInternal", url, action);
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": key,
        },
        body: JSON.stringify({ action, payload }),
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(`Internal API error ${response.status}: ${text}`);
    }
    console.log("rrrr", url, action, text);
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function notifyKash(action, payload) {
    return notifyInternal(
        process.env.KASH_INTERNAL_API_URL,
        process.env.KASH_INTERNAL_API_KEY,
        action,
        payload
    );
}

async function notifyTarot(action, payload) {
    return notifyInternal(
        process.env.TAROT_INTERNAL_API_URL,
        process.env.TAROT_INTERNAL_API_KEY,
        action,
        payload
    );
}

async function notifyProject(action, payload, event) {
    const eventPayload = withStripeEvent(payload, event);

    if (eventPayload && eventPayload.shop_id === "tarot") {
        return notifyTarot(action, eventPayload);
    }

    return notifyKash(action, eventPayload);
}


function withStripeEvent(payload, event) {
    return {
        ...payload,
        stripe_event_id: event.id,
        stripe_event_type: event.type,
        stripe_event_created: event.created,
    };
}

function getInvoiceSubscriptionId(invoice) {
    return (
        invoice.parent?.subscription_details?.subscription ||
        invoice.subscription ||
        invoice.subscription_details?.subscription ||
        null
    );
}

function serializeSubscriptionItems(subscription) {
    const items = subscription?.items?.data || [];
    return items.map((item) => ({
        item_id: item.id,
        price_id: item.price?.id || null,
        quantity: item.quantity || 0,
        current_period_start: item.current_period_start || subscription.current_period_start || null,
        current_period_end: item.current_period_end || subscription.current_period_end || null,
    }));
}

function subscriptionPeriod(subscription) {
    const items = serializeSubscriptionItems(subscription);
    return {
        current_period_start: subscription.current_period_start || (items[0] ? items[0].current_period_start : null),
        current_period_end: subscription.current_period_end || (items[0] ? items[0].current_period_end : null),
    };
}

function serializeInvoiceItems(invoice) {
    const lines = invoice?.lines?.data || [];
    return lines.map((line) => {
        const pricingPrice = line.pricing?.price_details?.price || null;
        return {
            item_id: line.subscription_item || null,
            price_id: typeof pricingPrice === "string"
                ? pricingPrice
                : (pricingPrice?.id || line.price?.id || null),
            quantity: line.quantity || 0,
            current_period_start: line.period?.start || null,
            current_period_end: line.period?.end || null,
        };
    }).filter((item) => item.price_id);
}

function itemsPeriod(items, fallback) {
    const starts = items.map((item) => item.current_period_start).filter(Boolean);
    const ends = items.map((item) => item.current_period_end).filter(Boolean);
    return {
        current_period_start: starts.length ? Math.min(...starts) : fallback.current_period_start,
        current_period_end: ends.length ? Math.max(...ends) : fallback.current_period_end,
    };
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
        console.log("received webhook " + event.type, event);
        var resF = "NOOO";
        try {
            switch (event.type) {
                case "checkout.session.completed":
                    resF = await handleCheckoutCompleted(event.data.object, event);
                    break;

                case "customer.subscription.created":
                case "customer.subscription.updated":
                    resF = await handleSubscriptionUpdated(event.data.object, event);
                    break;

                case "customer.subscription.deleted":
                    resF = await handleSubscriptionDeleted(event.data.object, event);
                    break;

                case "invoice.paid":
                    resF = await handleInvoicePaid(event.data.object, event);
                    break;

                case "invoice.payment_failed":
                    resF = await handleInvoicePaymentFailed(event.data.object, event);
                    break;
            }
            console.log("webhook result" + event.type, resF);
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
            stripe_customer_id,
            stripe_price_id,
            plan_code,
            billing_period,
            monthly_credits_premium,
            success_url,
            cancel_url,
        } = req.body;

        if (!user_id || !shop_id || !email || !stripe_price_id) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const metadata = {
            user_id: String(user_id),
            shop_id: String(shop_id),
            plan_code: plan_code || "",
            billing_period: billing_period || "",
            stripe_price_id,
            monthly_credits_premium: String(monthly_credits_premium || ""),
        };

        const sessionParams = {
            mode: "subscription",
            line_items: [{ price: stripe_price_id, quantity: 1 }],
            success_url: success_url || `${process.env.APP_URL}/?stripe-success=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel_url || `${process.env.APP_URL}/?stripe-cancel=1`,
            metadata,
            subscription_data: { metadata },
        };

        if (stripe_customer_id) {
            sessionParams.customer = stripe_customer_id;
        } else {
            sessionParams.customer_email = email;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);


        res.json({
            checkout_url: session.url,
            session_id: session.id,
        });
    } catch (err) {
        console.error("Create checkout error:", err);
        res.status(500).json({ error: "Unable to create checkout session", err });
    }
});

app.post("/stripe/create-white-label-checkout-session", checkInternalAuth, async (req, res) => {
    try {
        const {
            white_label_id,
            email,
            stripe_customer_id,
            essential_price_id,
            premium_price_id,
            essential_quantity,
            premium_quantity,
            success_url,
            cancel_url,
        } = req.body;

        const essentialQuantity = Math.max(0, parseInt(essential_quantity, 10) || 0);
        const premiumQuantity = Math.max(0, parseInt(premium_quantity, 10) || 0);
        if (!white_label_id || !email || !essential_price_id || !premium_price_id || essentialQuantity + premiumQuantity < 1) {
            return res.status(400).json({ error: "Missing or invalid parameters" });
        }

        const lineItems = [];
        if (essentialQuantity) lineItems.push({ price: essential_price_id, quantity: essentialQuantity });
        if (premiumQuantity) lineItems.push({ price: premium_price_id, quantity: premiumQuantity });
        const metadata = {
            billing_type: "white_label",
            white_label_id: String(white_label_id),
        };
        const sessionParams = {
            mode: "subscription",
            line_items: lineItems,
            success_url: success_url || `${process.env.APP_URL}/?stripe-success=1`,
            cancel_url: cancel_url || `${process.env.APP_URL}/?stripe-cancel=1`,
            metadata,
            subscription_data: { metadata },
        };
        if (stripe_customer_id) sessionParams.customer = stripe_customer_id;
        else sessionParams.customer_email = email;

        const session = await stripe.checkout.sessions.create(sessionParams);
        res.json({ checkout_url: session.url, session_id: session.id });
    } catch (err) {
        console.error("Create white-label checkout error:", err);
        res.status(500).json({ error: "Unable to create white-label checkout session" });
    }
});

app.post("/stripe/sync-white-label-subscription", checkInternalAuth, async (req, res) => {
    try {
        const {
            stripe_subscription_id,
            essential_price_id,
            premium_price_id,
            essential_quantity,
            premium_quantity,
        } = req.body;
        const targets = {};
        targets[essential_price_id] = Math.max(0, parseInt(essential_quantity, 10) || 0);
        targets[premium_price_id] = Math.max(0, parseInt(premium_quantity, 10) || 0);
        if (!stripe_subscription_id || !essential_price_id || !premium_price_id) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        let subscription = await stripe.subscriptions.retrieve(stripe_subscription_id, {
            expand: ["items.data.price"]
        });
        const totalQuantity = targets[essential_price_id] + targets[premium_price_id];
        if (!totalQuantity) {
            await stripe.subscriptions.update(stripe_subscription_id, {
                cancel_at_period_end: true,
                proration_behavior: "none",
            });
        } else {
            const updates = [];
            const foundPrices = {};
            for (const item of subscription.items.data) {
                const priceId = item.price.id;
                if (!Object.prototype.hasOwnProperty.call(targets, priceId)) continue;
                foundPrices[priceId] = true;
                if (targets[priceId] > 0) updates.push({ id: item.id, quantity: targets[priceId] });
                else updates.push({ id: item.id, deleted: true });
            }
            for (const priceId of [essential_price_id, premium_price_id]) {
                if (!foundPrices[priceId] && targets[priceId] > 0) {
                    updates.push({ price: priceId, quantity: targets[priceId] });
                }
            }
            await stripe.subscriptions.update(stripe_subscription_id, {
                cancel_at_period_end: false,
                proration_behavior: "none",
                items: updates,
            });
        }
        subscription = await stripe.subscriptions.retrieve(stripe_subscription_id, {
            expand: ["items.data.price"]
        });

        const period = subscriptionPeriod(subscription);
        res.json({
            success: true,
            subscription_id: subscription.id,
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_start: period.current_period_start,
            current_period_end: period.current_period_end,
            subscription_items: serializeSubscriptionItems(subscription),
        });
    } catch (err) {
        console.error("Sync white-label subscription error:", err);
        res.status(500).json({ error: "Unable to synchronize white-label subscription" });
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


async function handleCheckoutCompleted(session, event) {
    const res = await notifyProject("checkout_completed", {
        stripe_checkout_session_id: session.id,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,

        user_id: session.metadata ? session.metadata.user_id : null,
        shop_id: session.metadata ? session.metadata.shop_id : null,

        plan_code: session.metadata ? session.metadata.plan_code : null,
        billing_period: session.metadata ? session.metadata.billing_period : null,
        stripe_price_id: session.metadata ? session.metadata.stripe_price_id : null,

        billing_type: session.metadata ? session.metadata.billing_type : null,
        white_label_id: session.metadata ? session.metadata.white_label_id : null,

        payment_status: session.payment_status,
    }, event);
    console.log('handleCheckoutCompleted', res);
    return res;
}
async function handleSubscriptionUpdated(subscription, event) {
    const sub = await stripe.subscriptions.retrieve(subscription.id, {
        expand: ["items.data.price"]
    });

    const item =
        sub.items && sub.items.data && sub.items.data.length > 0
            ? sub.items.data[0]
            : null;

    const priceId = item && item.price ? item.price.id : null;

    const currentPeriodStart = sub.current_period_start || (item ? item.current_period_start : null);
    const currentPeriodEnd = sub.current_period_end || (item ? item.current_period_end : null);

    const period = subscriptionPeriod(sub);
    const payload = {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        stripe_price_id: priceId,

        user_id: sub.metadata ? sub.metadata.user_id : null,
        shop_id: sub.metadata ? sub.metadata.shop_id : null,

        plan_code: sub.metadata ? sub.metadata.plan_code : null,
        billing_period: sub.metadata ? sub.metadata.billing_period : null,

        billing_type: sub.metadata ? sub.metadata.billing_type : null,
        white_label_id: sub.metadata ? sub.metadata.white_label_id : null,
        subscription_items: serializeSubscriptionItems(sub),

        status: sub.status,

        current_period_start: period.current_period_start || currentPeriodStart,
        current_period_end: period.current_period_end || currentPeriodEnd,

        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at
    };

    //console.log("handleSubscriptionUpdated", payload);

    const res = await notifyProject("subscription_updated", payload, event);
    console.log('handleSubscriptionUpdated', res);
    return res;
}

async function handleSubscriptionDeleted(subscription, event) {
    const res = await notifyProject("subscription_deleted", {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        user_id: subscription.metadata?.user_id,
        shop_id: subscription.metadata?.shop_id,
        billing_type: subscription.metadata?.billing_type,
        white_label_id: subscription.metadata?.white_label_id,
        status: subscription.status,
        canceled_at: subscription.canceled_at,
    }, event);
    console.log('handleSubscriptionDeleted', res);
    return res;
}


async function handleInvoicePaid(invoice, event) {
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    const invoiceSubscriptionMetadata =
        invoice.parent?.subscription_details?.metadata || {};

    let subscription = null;

    if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["items.data.price"]
        });
    }

    const metadata = {
        ...(subscription?.metadata || {}),
        ...invoiceSubscriptionMetadata
    };

    const priceId =
        subscription?.items?.data?.[0]?.price?.id ||
        invoice.lines?.data?.[0]?.pricing?.price_details?.price ||
        invoice.lines?.data?.[0]?.price?.id ||
        null;

    if (!metadata.shop_id && priceId === process.env.TAROT_VIP_STRIPE_PRICE_ID) {
        metadata.shop_id = "tarot";
    }

    const invoiceItems = serializeInvoiceItems(invoice);
    const subscriptionItems = subscription ? serializeSubscriptionItems(subscription) : [];
    const invoicePeriod = itemsPeriod(
        invoiceItems,
        subscription ? subscriptionPeriod(subscription) : {}
    );

    const payload = {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: subscriptionId,

        user_id: metadata.user_id || null,
        shop_id: metadata.shop_id || null,

        plan_code: metadata.plan_code || null,
        billing_period: metadata.billing_period || null,
        stripe_price_id: metadata.stripe_price_id || priceId,
        monthly_credits_premium: metadata.monthly_credits_premium || null,

        billing_type: metadata.billing_type || null,
        white_label_id: metadata.white_label_id || null,
        subscription_items: invoiceItems.length ? invoiceItems : subscriptionItems,
        current_period_start: invoicePeriod.current_period_start || null,
        current_period_end: invoicePeriod.current_period_end || null,

        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
    };

    const res = await notifyProject("invoice_paid", payload, event);
    console.log("handleInvoicePaid", res, payload);
    return res;
}

/*

async function handleInvoicePaid(invoice) {
    const subscriptionId =
        invoice.subscription ||
        invoice.parent?.subscription_details?.subscription ||
        invoice.subscription_details?.subscription;

    const res = await notifyProject("invoice_paid", {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: subscriptionId,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
    });
    console.log('handleInvoicePaid', res, invoice);
    return res;
}*/

async function handleInvoicePaymentFailed(invoice, event) {
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    let subscription = null;
    if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["items.data.price"]
        });
    }
    const metadata = subscription?.metadata || invoice.parent?.subscription_details?.metadata || {};
    const invoiceItems = serializeInvoiceItems(invoice);
    const subscriptionItems = subscription ? serializeSubscriptionItems(subscription) : [];
    const period = itemsPeriod(invoiceItems, subscription ? subscriptionPeriod(subscription) : {});
    const res = await notifyProject("invoice_payment_failed", {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: subscriptionId,
        billing_type: metadata.billing_type || null,
        white_label_id: metadata.white_label_id || null,
        subscription_items: invoiceItems.length ? invoiceItems : subscriptionItems,
        current_period_start: period.current_period_start || null,
        current_period_end: period.current_period_end || null,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
    }, event);
    console.log('handleInvoicePaymentFailed', res);
    return res;
}

app.listen(process.env.PORT, () => {
    console.log(`Stripe proxy running on port ${process.env.PORT}`);
});
