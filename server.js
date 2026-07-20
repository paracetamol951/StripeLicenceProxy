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
    console.log("rrrr",url, action, text);
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
} const testP = {
    id: 'in_1TuX6r389UanmShJPwk1ZTuZ',
    object: 'invoice',
    account_country: 'FR',
    account_name: 'Net-assembly sandbox',
    account_tax_ids: null,
    amount_due: 400,
    amount_overpaid: 0,
    amount_paid: 400,
    amount_remaining: 0,
    amount_shipping: 0,
    application: null,
    attempt_count: 0,
    attempted: true,
    auto_advance: false,

    automatic_tax: {
        disabled_reason: null,
        enabled: false,
        liability: null,
        provider: null,
        status: null
    },

    automatically_finalizes_at: null,
    billing_reason: 'subscription_create',
    collection_method: 'charge_automatically',
    created: 1784376768,
    currency: 'eur',
    custom_fields: null,
    customer: 'cus_UuLohvBJ50d54J',
    customer_account: 'acct_1TuX6q389UhgZyP5',

    customer_address: {
        city: null,
        country: 'FR',
        line1: null,
        line2: null,
        postal_code: null,
        state: null
    },

    customer_email: 'qsdqsdggg@gmail.com',
    customer_name: 'sdfsdf',
    customer_phone: null,
    customer_shipping: null,
    customer_tax_exempt: 'none',
    customer_tax_ids: [],
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discounts: [],
    due_date: null,
    effective_at: 1784376768,
    ending_balance: 0,
    footer: null,
    from_invoice: null,

    hosted_invoice_url:
        'https://invoice.stripe.com/i/acct_1SAMeM389UanmShJ/test_YWNjdF8xU0FNZU0zODlVYW5tU2hKLF9VdUxvRVpOSDdIWk5ESTFSSENzMnVwVUlDQm5iZ3FmLDE3NDkxNzU3Mg0200PVW93HeY?s=ap',

    invoice_pdf:
        'https://pay.stripe.com/invoice/acct_1SAMeM389UanmShJ/test_YWNjdF8xU0FNZU0zODlVYW5tU2hKLF9VdUxvRVpOSDdIWk5ESTFSSENzMnVwVUlDQm5iZ3FmLDE3NDkxNzU3Mg0200PVW93HeY/pdf?s=ap',

    issuer: {
        type: 'self'
    },

    last_finalization_error: null,
    latest_revision: null,

    lines: {
        object: 'list',
        data: [
            {
                // Mets ici le véritable contenu de la ligne Stripe.
            }
        ],
        has_more: false,
        total_count: 1,
        url: '/v1/invoices/in_1TuX6r389UanmShJPwk1ZTuZ/lines'
    },

    livemode: false,
    metadata: {},
    next_payment_attempt: null,
    number: 'YBHBZJRY-0048',
    on_behalf_of: null,

    parent: {
        quote_details: null,
        subscription_details: {
            metadata: {},
            subscription: 'sub_1TuX6s389UanmShJF4mVFEvN'
        },
        type: 'subscription_details'
    },

    payment_settings: {
        default_mandate: null,
        payment_method_options: {
            acss_debit: null,
            bancontact: null,
            card: {},
            customer_balance: null,
            konbini: null,
            payto: null,
            pix: null,
            sepa_debit: null,
            upi: null,
            us_bank_account: null
        },
        payment_method_types: null
    },

    period_end: 1784376768,
    period_start: 1784376768,
    post_payment_credit_notes_amount: 0,
    pre_payment_credit_notes_amount: 0,
    receipt_number: null,
    rendering: null,
    shipping_cost: null,
    shipping_details: null,
    starting_balance: 0,
    statement_descriptor: null,
    status: 'paid',

    status_transitions: {
        finalized_at: 1784376768,
        marked_uncollectible_at: null,
        paid_at: 1784376769,
        voided_at: null
    },

    subtotal: 400,
    subtotal_excluding_tax: 400,
    test_clock: null,
    total: 400,
    total_discount_amounts: [],
    total_excluding_tax: 400,
    total_pretax_credit_amounts: [],
    total_taxes: [],
    webhooks_delivered_at: 1784376768
};

handleInvoicePaid(testP);

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

async function notifyProject(action, payload) {
    if (payload && payload.shop_id === "tarot") {
        return notifyTarot(action, payload);
    }

    return notifyKash(action, payload);
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
                    resF = await handleCheckoutCompleted(event.data.object);
                    break;

                case "customer.subscription.created":
                case "customer.subscription.updated":
                    resF = await handleSubscriptionUpdated(event.data.object);
                    break;

                case "customer.subscription.deleted":
                    resF = await handleSubscriptionDeleted(event.data.object);
                    break;

                case "invoice.paid":
                    resF = await handleInvoicePaid(event.data.object);
                    break;

                case "invoice.payment_failed":
                    resF = await handleInvoicePaymentFailed(event.data.object);
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

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: email,
            line_items: [{ price: stripe_price_id, quantity: 1 }],
            success_url: success_url || `${process.env.APP_URL}/?stripe-success=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancel_url || `${process.env.APP_URL}/?stripe-cancel=1`,
            metadata,
            subscription_data: { metadata },
        });


        res.json({
            checkout_url: session.url,
            session_id: session.id,
        });
    } catch (err) {
        console.error("Create checkout error:", err);
        res.status(500).json({ error: "Unable to create checkout session",err });
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
    const res = await notifyProject("checkout_completed", {
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
    return res;
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

    const currentPeriodStart = sub.current_period_start || (item ? item.current_period_start : null);
    const currentPeriodEnd = sub.current_period_end || (item ? item.current_period_end : null);

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

    const res = await notifyProject("subscription_updated", payload);
    console.log('handleSubscriptionUpdated', res);
    return res;
}

async function handleSubscriptionDeleted(subscription) {
    const res = await notifyProject("subscription_deleted", {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        user_id: subscription.metadata?.user_id,
        shop_id: subscription.metadata?.shop_id,
        status: subscription.status,
        canceled_at: subscription.canceled_at,
    });
    console.log('handleSubscriptionDeleted', res);
    return res;
}


async function handleInvoicePaid(invoice) {
    const subscriptionId =
        invoice.parent?.subscription_details?.subscription ||
        invoice.subscription ||
        invoice.subscription_details?.subscription ||
        null;

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

        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
    };

    const res = await notifyProject("invoice_paid", payload);
    console.log("handleInvoicePaid", res, payload);
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

async function handleInvoicePaymentFailed(invoice) {
    const res = await notifyProject("invoice_payment_failed", {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: invoice.subscription,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        hosted_invoice_url: invoice.hosted_invoice_url,
    });
    console.log('handleInvoicePaymentFailed', res);
    return res;
}

app.listen(process.env.PORT, () => {
    console.log(`Stripe proxy running on port ${process.env.PORT}`);
});