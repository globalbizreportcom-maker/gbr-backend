// backend/controllers/paymentController.js
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "../models/Payment.js";
import ReportRequest from "../models/ReportRequest.js";
import paypal from "@paypal/checkout-server-sdk";

// Move keys to .env in production
// const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_RLLP7cC84Ep2ms',
//     key_secret: process.env.RAZORPAY_KEY_SECRET || 'lCg8ZeIBhKQ93v9CDmZ4QrS2',
// });

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_ROY0D3SgPD1pdG',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '2wUhDOwdqHHTkTGLCNZobfvr',
});

// 🔹 Create Razorpay Order & ReportRequest
export const createOrder = async (req, res) => {
    try {
        const { amount, userId, formData, currency = "INR" } = req.body;

        if (!amount || !formData) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1️⃣ Save ReportRequest
        const reportRequestData = {
            targetCompany: {
                name: formData.companyName,
                address: formData.address,
                country: formData.country.label,
                state: formData.state,
                city: formData.city,
                postalCode: formData.postalCode,
                phone: formData.telephone,
                website: formData.website,
            },
            requester: userId,
            requesterInfo: {
                name: formData.contactName,
                email: formData.contactEmail,
                phone: formData.contactPhone,
                optionalEmail: formData.optionalEmail,
                company: formData.contactCompany,
                website: formData.website,
                country: formData.contactCountry.label || formData.contactCountry,
            },
            agreementAccepted: formData.agreedToTerms || false,
        };
        const reportRequest = await ReportRequest.create(reportRequestData);

        // 2️⃣ Create Razorpay order
        const options = {
            amount: 1 * 100, // paise
            // amount: 4720 * 100, // paise
            currency,
            receipt: `receipt_${Date.now()}`,
        };
        const order = await razorpay.orders.create(options);

        // 3️⃣ Store Payment record (with initial order info)
        await Payment.create({
            user: userId,
            reportRequest: reportRequest._id,
            orderId: order.id,
            amount,
            currency,
            status: "created",
            method: "razorpay",
            details: {
                receipt: order.receipt,
                currency: order.currency,
                amount: order.amount,
            },
        });

        // 4️⃣ Send order details to frontend
        res.json({ orderId: order.id, amount, currency, key: 'rzp_live_ROY0D3SgPD1pdG' });
    } catch (error) {
        res.status(500).json({ error: "Failed to create Razorpay order" });
    }
};

// 🔹 Verify Razorpay Payment
export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: "Missing payment details" });
        }

        // 1️⃣ Verify signature
        const generatedSignature = crypto
            .createHmac("sha256", 'lCg8ZeIBhKQ93v9CDmZ4QrS2')
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Payment verification failed" });
        }

        // 2️⃣ Fetch full Razorpay payment details
        const razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
        console.log("✅ Razorpay Payment Details:", razorpayPayment);

        // 3️⃣ Map Razorpay fields to Payment.details
        const paymentDetails = {
            payerEmail: razorpayPayment.email || "",
            payerName: razorpayPayment.contact || "",
            payerContact: razorpayPayment.contact || "",
            upiId: razorpayPayment.vpa || razorpayPayment.upi?.vpa || "",
            upiTransactionId: razorpayPayment.acquirer_data?.upi_transaction_id || "",
            rrn: razorpayPayment.acquirer_data?.rrn || "",
            bankName: razorpayPayment.bank || "",
            cardLast4: razorpayPayment.card_id || "",
            cardType: razorpayPayment.card_type || "",
            acquirerData: razorpayPayment.acquirer_data || {},
            description: razorpayPayment.description || "",
            fee: razorpayPayment.fee || 0,
            tax: razorpayPayment.tax || 0,
            notes: razorpayPayment.notes || [],
            receipt: razorpayPayment.receipt || "",
            international: razorpayPayment.international || false,
            wallet: razorpayPayment.wallet || "",
        };

        // 4️⃣ Update Payment in DB
        const payment = await Payment.findOneAndUpdate(
            { orderId: razorpay_order_id },
            {
                status: "paid",
                paymentId: razorpay_payment_id,
                paidAt: new Date(),
                method: razorpayPayment.method || "razorpay",
                details: paymentDetails,
            },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found" });
        }

        res.json({ success: true, message: "Payment verified successfully", payment });
    } catch (error) {
        console.error("❌ Razorpay payment verification error:", error);
        res.status(500).json({ error: "Payment verification failed" });
    }
};


// PayPal environment
const Environment = paypal.core.SandboxEnvironment;
// const client = new paypal.core.PayPalHttpClient(
//     new Environment("AXE0e0T-WVhYAxm7bKHdfiufchoL27auBeQ5PgJQ8UzmExYoesadzdcBxet-A3l2l1_m8V3CLLijAll9",
//         "EIb6PTnkVXKOdw4bH8i7nbu1X5H-FGIKzdMgJ8VLDwKiXe6oaxygr4IKW5NOib0LeuRVMF0e8kBy7LWi")
// );
const client = new paypal.core.PayPalHttpClient(
    new Environment("AY6fBteBTgpncQezbVjnZvrR4AP1s5g73oqCxlIkvep9KvnxKSoU7XFqOK6YblkgY0INBjZuUpQtAUlP",
        "EAoBmiFDQBeHUtxIZzZiSG6SMhSRavBxNZHeVliSVkOmNqOejy63LF4Gt5MQ0ScapDGWLhoYO2ehvRIU")
);

// 🔹 Create PayPal Order
export const createPaypalOrder = async (req, res) => {
    try {
        let { amount, userId, formData, currency = "USD" } = req.body;
        console.log("UserId:", userId);

        if (!amount || !formData) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        let country = formData.contactCountry?.label || formData.contactCountry || "";
        country = country.trim();

        // Map flat formData to nested ReportRequest structure
        const reportRequestData = {
            targetCompany: {
                name: formData.companyName,
                address: formData.address,
                country: formData.country?.label || "",
                state: formData.state,
                city: formData.city,
                postalCode: formData.postalCode,
                phone: formData.telephone || "",
                website: formData.website || "",
            },
            requester: userId, // must be a valid ObjectId
            requesterInfo: {
                name: formData.contactName,
                email: formData.contactEmail,
                phone: formData.contactPhone,
                optionalEmail: formData.optionalEmail || "",
                company: formData.contactCompany || "",
                website: formData.website || "",
                country: formData.contactCountry?.label || formData.contactCountry || "",
            },
            agreementAccepted: formData.agreedToTerms || false,
        };

        // 1️⃣ Save ReportRequest
        const reportRequest = await ReportRequest.create(reportRequestData);


        // Map countries to prices
        const countryPrices = {
            "USA": 69,
            "Canada": 69,
            "India": 49,
            "China": 79,
            "Asia (excluding India & China)": 79,
            "Europe": 79,
            "Middle East": 79,
            "Australia & New Zealand": 89,
            "Africa": 89,
            "Oceania": 89,
            "Latin America": 99,
            "Other Countries": 99,
        };

        amount = countryPrices[country] || 99; // Default to 99 USD if country not listed

        // 2️⃣ Create PayPal Order
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: currency,
                        value: amount.toString(),
                    },
                },
            ],
        });

        const order = await client.execute(request);
        console.log("PayPal Order:", order);

        // 3️⃣ Store Payment
        await Payment.create({
            user: userId,
            reportRequest: reportRequest._id,
            orderId: order.result.id,
            amount,
            currency,
            status: "created",
            method: "paypal", // 🔹 store payment method
            details: {
                payerEmail: formData.contactEmail,
                payerName: formData.contactName,
            },
        });

        res.json({ orderId: order.result.id, clientId: 'AY6fBteBTgpncQezbVjnZvrR4AP1s5g73oqCxlIkvep9KvnxKSoU7XFqOK6YblkgY0INBjZuUpQtAUlP' });
    } catch (error) {
        res.status(500).json({ error: "Failed to create PayPal order" });
    }
};

// 🔹 Capture/Verify PayPal Payment
export const capturePaypalPayment = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ error: "Missing orderId" });
        }

        // Capture PayPal order
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        const capture = await client.execute(request);
        const captureInfo = capture.result.purchase_units?.[0]?.payments?.captures?.[0] || {};
        const payerInfo = capture.result.payer || {};

        // Map to the model's details structure
        const paymentDetails = {
            // PayPal-specific
            captureId: captureInfo.id,
            status: captureInfo.status,
            amount: captureInfo.amount?.value,
            currency: captureInfo.amount?.currency_code,
            payerName: payerInfo.name?.given_name && payerInfo.name?.surname
                ? `${payerInfo.name.given_name} ${payerInfo.name.surname}`
                : "",
            payerEmail: payerInfo.email_address || "",
            payerContact: payerInfo.phone?.phone_number?.national_number || "",

            // Optional / future fields left blank for now
            cardLast4: captureInfo.payment_source?.card?.last_digits || "",
            cardType: captureInfo.payment_source?.card?.brand || "",
            upiId: captureInfo.payment_source?.upi?.vpa || "",
            upiTransactionId: captureInfo.payment_source?.upi?.transaction_id || "",
            rrn: captureInfo.payment_source?.upi?.rrn || "",
            bankName: captureInfo.payment_source?.bank?.name || "",
            accountNumber: "",
            ifsc: "",
            chequeNumber: "",
            acquirerData: captureInfo.payment_source || {},
            description: captureInfo.description || "",
            fee: captureInfo.seller_receivable_breakdown?.paypal_fee?.value || 0,
            tax: captureInfo.seller_receivable_breakdown?.tax?.value || 0,
            notes: captureInfo.custom_id ? [captureInfo.custom_id] : [],
        };

        // Update Payment document
        const payment = await Payment.findOneAndUpdate(
            { orderId },
            {
                status: "paid",
                paymentId: captureInfo.id || orderId,
                paidAt: new Date(),
                method: "paypal",
                details: paymentDetails,
            },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found" });
        }

        res.json({ success: true, message: "Payment captured", payment });
    } catch (error) {
        console.error("❌ PayPal capture error:", error);
        res.status(500).json({ error: "Failed to capture PayPal payment" });
    }
};
