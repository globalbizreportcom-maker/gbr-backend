// backend/controllers/paymentController.js
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "../models/Payment.js";
import ReportRequest from "../models/ReportRequest.js";
import paypal from "@paypal/checkout-server-sdk";
import transporter from "../utils/Nodemailer.js";
import User from "../models/User.js";

// Move keys to .env in production
// const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_RLLP7cC84Ep2ms',
//     key_secret: process.env.RAZORPAY_KEY_SECRET || 'lCg8ZeIBhKQ93v9CDmZ4QrS2',
// });


const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_ROY0D3SgPD1pdG',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '2wUhDOwdqHHTkTGLCNZobfvr',
});

async function sendCreditReportEmail(recipientEmail, { paymentDetails, reportRequest }) {
    // Destructure requester info
    const {
        name,
        email,
        phone,
        optionalEmail,
        company: requesterCompany,
        website: requesterWebsite,
        country: requesterCountry
    } = reportRequest?.requesterInfo || {};

    // Destructure target company info
    const {
        name: targetCompanyName,
        address: targetCompanyAddress,
        country: targetCompanyCountry,
        website: targetCompanyWebsite
    } = reportRequest?.targetCompany || {};

    try {

        //  Email options
        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: recipientEmail,
            subject: "Your Credit Report Order is being Processed – GlobalBizReport.com",
            html: `
        <p>Dear ${name || 'User'},</p>
        <p>Thank you for your order with GlobalBizReport.com (GBR). We appreciate your trust in our services.</p>

        <p>We are pleased to confirm receipt of your request for a freshly investigated Business Credit Report. Our investigation team has initiated the process, and the completed report will be emailed to you at the earliest.</p>

        <p>Kindly review the following inquiry details and confirm if the information is correct:</p>
        <hr />
        <p><strong>Company Inquiry Details – Company to Verify</strong><br/>
        ${targetCompanyName || '(Company Name)'}<br/>
        ${targetCompanyAddress || '(Address)'}<br/>
        ${targetCompanyCountry || '(Country)'}<br/>
        ${targetCompanyWebsite || '(Website)'}
        </p>
        <hr />

        <p>At GlobalBizReport, we are committed to delivering 100% freshly investigated credit reports known for their exceptional quality, in-depth coverage, and accuracy. Our standard delivery timeframe for international reports is now just 1-3 business days.</p>

        <p>Thank you once again for choosing GBR Reports as your trusted credit reporting partner. We look forward to supporting your ongoing credit risk assessment and business due diligence needs.</p>

        <p>If you have any questions or need support with additional reports, please feel free to contact us — we’ll be happy to assist you.</p>

        <p>Best Regards,</p>
        <br/>
        Team - GBR <br/>
        <a href="https://www.GlobalBizReport.com">www.GlobalBizReport.com</a></p>

        <hr />
        <p><strong>About GlobalBizReport (GBR):</strong><br/>
        GlobalBizReport is one of the world’s most trusted platforms for freshly investigated Business Credit Report and Due Diligence Reports, serving Corporates, SMEs, B2B Marketplaces, Financial Institutions, and Consulting Organisations in 220+ countries. Trusted by 20,000+ companies globally, GBR delivers fast, accurate, and in-depth business insights on companies worldwide.
        </p>
      `,
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);

    } catch (err) {
        console.error("Error sending email:", err);
    }
}

async function sendPaymentCancelledEmail(recipientEmail, recipientName, orderId) {
    try {
        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: recipientEmail,
            subject: "Complete Your Order – GlobalBizReport.com",
            html: `
                <p>Dear ${recipientName || 'User'},</p>

                <p>Thank you for your interest to inquire for a Freshly Investigated Credit Report from www.GlobalBizReport.com (GBR). We want to assure you that you made the right choice. GBR is one of the most reliable business services platforms providing Freshly Investigated Business Credit Reports to Corporates, SMEs, B2B Marketplaces, Financial Institutes, Global Consultancy & Market Research companies worldwide.</p>

                <p>We noticed that you couldn't complete the transaction due to some technical problem. We are sorry for the inconvenience. But no worries!</p>

                <p>In order to save your time, we give below a link to continue from where you left.</p>

                <p><a href="https://www.GlobalBizReport.com/order-business-credit-report" style="display:inline-block;padding:10px 20px;background:#FF6600;color:#fff;text-decoration:none;border-radius:5px;">Click here to Complete Your Order</a></p>

                <p>GBR offers its service in over 220+ countries and GBR Credit Reports gives you full picture of company's reliability, registration data, financial health, credit worthiness check, credit rating score, Directors Info, details on any Negative information and much more.</p>

                <p>Once again thank you for your interest in considering GlobalBizReport as your Credit Reporting Partner. We look forward to receiving your order and to serving you for your future credit reporting needs.</p>

                <p>For any queries, please feel free to contact us at <a href="mailto:support@globalbizreport.com">support@globalbizreport.com</a></p>

                <p>Regards,<br/>
                Team - GBR </p>

                <p><em>Click here in case you want to view a sample report. Please note that the contents of the report like financial statements etc. are subject to availability depending on the local government policies and corporate information disclosure of the subject/country.</em></p>
            `,
        };

        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error("Error sending payment cancelled email:", err);
    }
}



// 🔹 Create Razorpay Order & ReportRequest
// export const createOrder = async (req, res) => {
//     try {
//         const { amount, userId, formData, currency = "INR" } = req.body;

//         if (!amount || !formData) {
//             return res.status(400).json({ error: "Missing required parameters" });
//         }

//         // 1️⃣ Save ReportRequest
//         const reportRequestData = {
//             targetCompany: {
//                 name: formData.companyName,
//                 address: formData.address,
//                 country: formData.country.label,
//                 state: formData.state,
//                 city: formData.city,
//                 postalCode: formData.postalCode,
//                 phone: formData.telephone,
//                 website: formData.website,
//             },
//             requester: userId,
//             requesterInfo: {
//                 name: formData.contactName,
//                 email: formData.contactEmail,
//                 phone: formData.contactPhone,
//                 optionalEmail: formData.optionalEmail,
//                 company: formData.contactCompany,
//                 website: formData.website,
//                 country: formData.contactCountry.label || formData.contactCountry,
//             },
//             agreementAccepted: formData.agreedToTerms || false,
//         };
//         const reportRequest = await ReportRequest.create(reportRequestData);

//         // 2️⃣ Pricing table
//         const countryPricing = [
//             { country: "USA", total: 7080 },
//             { country: "Canada", total: 7080 },
//             { country: "India", total: 4720 },
//             { country: "China", total: 7670 },
//             { country: "Asia (excluding India & China)", total: 7670 },
//             { country: "Europe", total: 7670 },
//             { country: "Middle East", total: 7670 },
//             { country: "Australia & New Zealand", total: 8850 },
//             { country: "Africa", total: 8260 },
//             { country: "Oceania", total: 8850 },
//             { country: "Latin America", total: 9440 },
//             { country: "Other Countries", total: 9440 },
//         ];

//         const asianCountries = [
//             "Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "Georgia",
//             "Indonesia", "Japan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos",
//             "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea",
//             "Oman", "Pakistan", "Philippines", "Qatar", "Saudi Arabia", "Singapore",
//             "South Korea", "Sri Lanka", "Syria", "Tajikistan", "Thailand", "Timor-Leste",
//             "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"
//         ];
//         const australiaNZ = ["Australia", "New Zealand"];
//         const middleEast = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"];
//         const latinAmerica = ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru"];
//         const africa = ["South Africa", "Nigeria", "Egypt", "Kenya", "Morocco", "Ethiopia"];
//         const oceania = ["Fiji", "Papua New Guinea", "Samoa", "Tonga"];
//         const europe = ["UK", "Germany", "France", "Italy", "Spain", "Europe"];

//         // 3️⃣ Determine target region
//         const targetCountry = formData.country.label || formData.country;
//         const payerCountry = formData.contactCountry.label || formData.contactCountry;

//         const getRegion = (country) => {
//             const c = country.toLowerCase();
//             if (c === "india") return "India";
//             if (c === "china") return "China";
//             if (asianCountries.map(x => x.toLowerCase()).includes(c)) return "Asia (excluding India & China)";
//             if (australiaNZ.map(x => x.toLowerCase()).includes(c)) return "Australia & New Zealand";
//             if (middleEast.map(x => x.toLowerCase()).includes(c)) return "Middle East";
//             if (latinAmerica.map(x => x.toLowerCase()).includes(c)) return "Latin America";
//             if (africa.map(x => x.toLowerCase()).includes(c)) return "Africa";
//             if (oceania.map(x => x.toLowerCase()).includes(c)) return "Oceania";
//             if (["usa", "united states"].includes(c)) return "USA";
//             if (["canada"].includes(c)) return "Canada";
//             if (europe.map(x => x.toLowerCase()).includes(c)) return "Europe";
//             return "Other Countries";
//         };

//         const targetRegion = getRegion(targetCountry || "");
//         const pricing = countryPricing.find(item => item.country === targetRegion) || countryPricing.find(item => item.country === "Other Countries");
//         const totalAmount = pricing.total;

//         // 4️⃣ Determine payment currency based on payer country
//         currency = payerCountry.toLowerCase() === "india" ? "INR" : "USD";

//         // 5️⃣ Create Razorpay order only if INR
//         let order = null;
//         if (currency === "INR") {
//             const options = {
//                 amount: totalAmount * 100, // in paise
//                 currency,
//                 receipt: `receipt_${Date.now()}`,
//             };
//             order = await razorpay.orders.create(options);
//         }


//         // 3️⃣ Store Payment record (with initial order info)
//         await Payment.create({
//             user: userId,
//             reportRequest: reportRequest._id,
//             orderId: order.id,
//             amount: totalAmount, // in INR
//             currency,
//             status: "created",
//             method: "razorpay",
//             details: {
//                 ...req.body.details,  // <-- preserve any details sent from frontend
//                 receipt: order.receipt,
//                 currency: order.currency,
//                 amount: order.amount,
//             },
//         });

//         // 4️⃣ Send order details to frontend
//         res.json({ orderId: order.id, amount, currency, key: 'rzp_live_ROY0D3SgPD1pdG' });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to create Razorpay order" });
//     }
// };

// 🔹 Create Razorpay Order & ReportRequest
export const createOrder = async (req, res) => {
    try {
        const { amount, userId, formData } = req.body;

        if (!amount || !formData) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1️⃣ Save ReportRequest
        const reportRequestData = {
            targetCompany: {
                name: formData.companyName,
                address: formData.address,
                country: typeof formData.country === "string" ? formData.country : formData.country.label,
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
                country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry.label,
            },
            agreementAccepted: formData.agreedToTerms || false,
        };
        const reportRequest = await ReportRequest.create(reportRequestData);

        // 2️⃣ Pricing maps
        const pricingINR = {
            India: 4720,
            China: 7670,
            "Asia (excluding India & China)": 7670,
            USA: 7080,
            Canada: 7080,
            Europe: 7670,
            "Middle East": 7670,
            "Australia & New Zealand": 8850,
            Africa: 8260,
            Oceania: 8850,
            "Latin America": 9440,
            "Other Countries": 9440,
        };

        const pricingUSD = {
            India: 49,
            China: 79,
            "Asia (excluding India & China)": 79,
            USA: 69,
            Canada: 69,
            Europe: 79,
            "Middle East": 79,
            "Australia & New Zealand": 89,
            Africa: 89,
            Oceania: 89,
            "Latin America": 99,
            "Other Countries": 99,
        };

        // 3️⃣ Region detection (frontend logic exactly)

        const normalize = (str) => str?.toString().trim().toLowerCase();


        const getRegion = (country) => {
            const asiaExcludingIndiaChina = [
                "Japan", "South Korea", "Singapore", "Thailand", "Malaysia", "Indonesia",
                "Philippines", "Vietnam", "Nepal", "Sri Lanka", "Bangladesh", "Pakistan",
                "Myanmar", "Bhutan", "Cambodia", "Laos", "Brunei", "Maldives"
            ].map(normalize);

            const australiaNZ = ["Australia", "New Zealand"].map(normalize);
            const middleEast = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"].map(normalize);
            const latinAmerica = ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru"].map(normalize);
            const africa = ["South Africa", "Nigeria", "Egypt", "Kenya", "Morocco", "Ethiopia"].map(normalize);
            const oceania = ["Fiji", "Papua New Guinea", "Samoa", "Tonga"].map(normalize);

            const c = normalize(country);
            if (!c) return "Other Countries";
            if (c === "india") return "India";
            if (c === "china") return "China";
            if (asiaExcludingIndiaChina.includes(c)) return "Asia (excluding India & China)";
            if (australiaNZ.includes(c)) return "Australia & New Zealand";
            if (middleEast.includes(c)) return "Middle East";
            if (latinAmerica.includes(c)) return "Latin America";
            if (africa.includes(c)) return "Africa";
            if (oceania.includes(c)) return "Oceania";
            if (["usa", "united states"].includes(c)) return "USA";
            if (["canada"].includes(c)) return "Canada";
            if (["europe", "uk", "germany", "france", "italy", "spain"].includes(c)) return "Europe";

            return "Other Countries";
        };



        // 4️⃣ Extract countries
        const payerCountry = typeof formData.contactCountry === "string"
            ? formData.contactCountry
            : formData.contactCountry?.label;

        const targetCountry = typeof formData.country === "string"
            ? formData.country
            : formData.country?.label || formData.country?.value;


        // 5️⃣ Determine region & currency
        const targetRegion = getRegion(targetCountry);
        const currency = payerCountry?.toLowerCase() === "india" ? "INR" : "USD";
        const totalAmount = currency === "INR"
            ? pricingINR[targetRegion] || pricingINR["Other Countries"]
            : pricingUSD[targetRegion] || pricingUSD["Other Countries"];

        // 6️⃣ Create Razorpay order only for INR
        let order = null;
        if (currency === "INR") {
            order = await razorpay.orders.create({
                amount: totalAmount * 100,
                currency,
                receipt: `receipt_${Date.now()}`,
            });
        }

        // 7️⃣ Save payment record
        await Payment.create({
            user: userId,
            reportRequest: reportRequest._id,
            orderId: order?.id,
            amount: totalAmount,
            currency,
            status: "created",
            method: currency === "INR" ? "razorpay" : "offline",
            details: {
                ...req.body.details,
                receipt: order?.receipt,
                currency: order?.currency || currency,
                amount: order?.amount || totalAmount,
            },
        });

        // 8️⃣ Respond
        res.json({ orderId: order?.id || null, amount: totalAmount, currency, key: 'rzp_live_ROY0D3SgPD1pdG' });
    } catch (error) {
        console.error("createOrder error:", error);
        res.status(500).json({ error: "Failed to create order" });
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

        // 5️⃣ Fetch the related report request using reportRequest ID
        const reportRequest = await ReportRequest.findById(payment.reportRequest);
        if (!reportRequest) {
            console.warn("Report request not found for payment:", payment._id);
        }

        // 6️⃣ Send email if payerEmail exists, passing paymentDetails + reportRequest
        if (paymentDetails.payerEmail) {
            sendCreditReportEmail(paymentDetails.payerEmail, {
                paymentDetails,
                reportRequest,
            })
                .then(() => console.log("Credit report email sent successfully"))
                .catch((err) => console.log("Failed to send credit report email:", err));
        }

        res.json({ success: true, message: "Payment verified successfully", payment });
    } catch (error) {
        console.error("❌ Razorpay payment verification error:", error);
        res.status(500).json({ error: "Payment verification failed" });
    }
};


// PayPal environment
// const Environment = paypal.core.SandboxEnvironment;
// const client = new paypal.core.PayPalHttpClient(
//     new Environment("AXE0e0T-WVhYAxm7bKHdfiufchoL27auBeQ5PgJQ8UzmExYoesadzdcBxet-A3l2l1_m8V3CLLijAll9",
//         "EIb6PTnkVXKOdw4bH8i7nbu1X5H-FGIKzdMgJ8VLDwKiXe6oaxygr4IKW5NOib0LeuRVMF0e8kBy7LWi")
// );

const clientId = 'AbYmo3fDOLo929hTcfuSF5OAsTXMmvUiLalzVeXkqtWNVNlbaBP6erqJfy4bw1zP0MgBRoKhWUJ4LA6-'
const clientSecret = 'ELYIqvUKnIaLiV1hG4I7Ty7xk4Mkw1FA2rkWCZzH9FqejbyfVeZTjn_fKsPeZZNGtosYYx2D5nLadvrU'
const environment = new paypal.core.LiveEnvironment(clientId, clientSecret);
const client = new paypal.core.PayPalHttpClient(environment);


// const client = new paypal.core.PayPalHttpClient(
//     new paypal.core.LiveEnvironment("AbYmo3fDOLo929hTcfuSF5OAsTXMmvUiLalzVeXkqtWNVNlbaBP6erqJfy4bw1zP0MgBRoKhWUJ4LA6-",
//         "ELYIqvUKnIaLiV1hG4I7Ty7xk4Mkw1FA2rkWCZzH9FqejbyfVeZTjn_fKsPeZZNGtosYYx2D5nLadvrU")
// );



// 🔹 Capture/Verify PayPal Payment
export const createPaypalOrder = async (req, res) => {
    try {
        const { userId, formData } = req.body;
        if (!formData) return res.status(400).json({ error: "Missing formData" });

        // 1️⃣ Save ReportRequest in DB
        const reportRequestData = {
            targetCompany: {
                name: formData.companyName,
                address: formData.address,
                country: typeof formData.country === "string" ? formData.country : formData.country?.label || "",
                state: formData.state,
                city: formData.city,
                postalCode: formData.postalCode,
                phone: formData.telephone || "",
                website: formData.website || "",
            },
            requester: userId,
            requesterInfo: {
                name: formData.contactName,
                email: formData.contactEmail,
                phone: formData.contactPhone,
                optionalEmail: formData.optionalEmail || "",
                company: formData.contactCompany || "",
                website: formData.website || "",
                country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry?.label || "",
            },
            agreementAccepted: formData.agreedToTerms || false,
        };
        const reportRequest = await ReportRequest.create(reportRequestData);

        // 2️⃣ Pricing maps
        const pricingUSD = {
            India: 49,
            China: 79,
            "Asia (excluding India & China)": 79,
            USA: 69,
            Canada: 69,
            Europe: 79,
            "Middle East": 79,
            "Australia & New Zealand": 89,
            Africa: 89,
            Oceania: 89,
            "Latin America": 99,
            "Other Countries": 99,
        };

        // 3️⃣ Asian countries list
        const asianCountries = [
            "Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "Georgia", "Indonesia",
            "Japan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Malaysia", "Maldives",
            "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Philippines",
            "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria",
            "Tajikistan", "Thailand", "Timor-Leste", "Turkmenistan", "United Arab Emirates",
            "Uzbekistan", "Vietnam", "Yemen"
        ];

        // 4️⃣ Helper to normalize strings
        const normalize = str => str?.toString().trim().toLowerCase();

        // 5️⃣ Get countries
        const payerCountry = normalize(formData.contactCountry?.label || formData.contactCountry);
        const targetCountry = normalize(formData.country?.label || formData.country);

        // 6️⃣ Determine currency
        const currency = payerCountry === "india" ? "INR" : "USD";

        // 7️⃣ Determine region for pricing (based on target company)
        let targetRegion = "Other Countries";
        if (targetCountry === "india") targetRegion = "India";
        else if (targetCountry === "china") targetRegion = "China";
        else if (asianCountries.map(normalize).includes(targetCountry)) targetRegion = "Asia (excluding India & China)";
        else if (["usa", "united states"].includes(targetCountry)) targetRegion = "USA";
        else if (["canada"].includes(targetCountry)) targetRegion = "Canada";
        else if (["europe", "uk", "germany", "france", "italy", "spain"].includes(targetCountry)) targetRegion = "Europe";
        else if (["uae", "saudi arabia", "qatar", "kuwait", "bahrain", "oman"].includes(targetCountry)) targetRegion = "Middle East";
        else if (["australia", "new zealand"].includes(targetCountry)) targetRegion = "Australia & New Zealand";
        else if (["south africa", "nigeria", "egypt", "kenya", "morocco", "ethiopia"].includes(targetCountry)) targetRegion = "Africa";
        else if (["fiji", "papua new guinea", "samoa", "tonga"].includes(targetCountry)) targetRegion = "Oceania";
        else if (["brazil", "mexico", "argentina", "colombia", "chile", "peru"].includes(targetCountry)) targetRegion = "Latin America";

        // 8️⃣ Decide final amount
        const amount = currency === "INR"
            ? pricingUSD[targetRegion] * 100 // For Razorpay, INR multiplied by 100 if needed
            : pricingUSD[targetRegion]; // USD stays as-is

        // 9️⃣ Create PayPal order (if USD)
        let orderId = null;
        if (currency === "USD") {
            const request = new paypal.orders.OrdersCreateRequest();
            request.prefer("return=representation");
            request.requestBody({
                intent: "CAPTURE",
                purchase_units: [{ amount: { currency_code: currency, value: amount.toString() } }],
            });
            const order = await client.execute(request);
            orderId = order.result.id;
        }

        // 10️⃣ Save Payment record
        await Payment.create({
            user: userId,
            reportRequest: reportRequest._id,
            orderId: orderId || `razorpay_${Date.now()}`, // fallback for INR if Razorpay handled separately
            amount,
            currency,
            status: "created",
            method: currency === "INR" ? "razorpay" : "paypal",
            details: { payerName: formData.contactName, payerEmail: formData.contactEmail },
        });

        // 11️⃣ Respond
        res.json({
            orderId,
            amount,
            currency,
            key: currency === "INR" ? "rzp_live_ROY0D3SgPD1pdG" : null,
        });

    } catch (error) {
        console.error("createPaypalOrder error:", error);
        res.status(500).json({ error: "Failed to create PayPal order" });
    }
};


// export const createPaypalOrder = async (req, res) => {
//     try {
//         const { userId, formData, currency = "USD" } = req.body;
//         if (!formData) return res.status(400).json({ error: "Missing formData" });

//         // 1️⃣ Save ReportRequest
//         const reportRequestData = {
//             targetCompany: {
//                 name: formData.companyName,
//                 address: formData.address,
//                 country: typeof formData.country === "string" ? formData.country : formData.country.label || "",
//                 state: formData.state,
//                 city: formData.city,
//                 postalCode: formData.postalCode,
//                 phone: formData.telephone || "",
//                 website: formData.website || "",
//             },
//             requester: userId,
//             requesterInfo: {
//                 name: formData.contactName,
//                 email: formData.contactEmail,
//                 phone: formData.contactPhone,
//                 optionalEmail: formData.optionalEmail || "",
//                 company: formData.contactCompany || "",
//                 website: formData.website || "",
//                 country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry.label || "",
//             },
//             agreementAccepted: formData.agreedToTerms || false,
//         };
//         const reportRequest = await ReportRequest.create(reportRequestData);

//         // 2️⃣ Determine pricing
//         const pricingUSD = { India: 49, China: 79, "Asia (excluding India & China)": 79, USA: 69, Canada: 69, Europe: 79, "Middle East": 79, "Australia & New Zealand": 89, Africa: 89, Oceania: 89, "Latin America": 99, "Other Countries": 99 };
//         const asianCountries = ["Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "Georgia", "Indonesia", "Japan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Philippines", "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Tajikistan", "Thailand", "Timor-Leste", "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"];
//         const normalize = (str) => str?.toString().trim().toLowerCase();
//         const c = normalize(formData.contactCountry?.label || formData.contactCountry || "");
//         let targetRegion = "Other Countries";
//         if (c === "india") targetRegion = "India";
//         else if (c === "china") targetRegion = "China";
//         else if (asianCountries.map(normalize).includes(c)) targetRegion = "Asia (excluding India & China)";
//         else if (["usa", "united states"].includes(c)) targetRegion = "USA";
//         else if (["canada"].includes(c)) targetRegion = "Canada";
//         else if (["europe", "uk", "germany", "france", "italy", "spain"].includes(c)) targetRegion = "Europe";
//         else if (["uae", "saudi arabia", "qatar", "kuwait", "bahrain", "oman"].includes(c)) targetRegion = "Middle East";
//         else if (["australia", "new zealand"].includes(c)) targetRegion = "Australia & New Zealand";
//         else if (["south africa", "nigeria", "egypt", "kenya", "morocco", "ethiopia"].includes(c)) targetRegion = "Africa";
//         else if (["fiji", "papua new guinea", "samoa", "tonga"].includes(c)) targetRegion = "Oceania";
//         else if (["brazil", "mexico", "argentina", "colombia", "chile", "peru"].includes(c)) targetRegion = "Latin America";

//         const amount = pricingUSD[targetRegion] || pricingUSD["Other Countries"];

//         // 3️⃣ Create PayPal order
//         const request = new paypal.orders.OrdersCreateRequest();
//         request.prefer("return=representation");
//         request.requestBody({
//             intent: "CAPTURE",
//             purchase_units: [{ amount: { currency_code: currency, value: amount.toString() } }],
//         });
//         const order = await client.execute(request);

//         // 4️⃣ Save Payment record
//         await Payment.create({
//             user: userId,
//             reportRequest: reportRequest._id,
//             orderId: order.result.id,
//             amount,
//             currency,
//             status: "created",
//             method: "paypal",
//             details: { payerEmail: formData.contactEmail, payerName: formData.contactName },
//         });

//         res.json({ orderId: order.result.id, clientId, amount, currency });
//     } catch (error) {
//         console.error("createPaypalOrder error:", error);
//         res.status(500).json({ error: "Failed to create PayPal order" });
//     }
// };

// Capture payment endpoint
export const capturePaypalPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).json({ error: "Missing orderId" });

        // Capture PayPal order
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        const capture = await client.execute(request);

        const captureInfo = capture.result.purchase_units?.[0]?.payments?.captures?.[0] || {};
        const payerInfo = capture.result.payer || {};

        // Update Payment record
        const payment = await Payment.findOneAndUpdate(
            { orderId },
            {
                status: "paid",
                paymentId: captureInfo.id || orderId,
                paidAt: new Date(),
                details: {
                    captureId: captureInfo.id,
                    status: captureInfo.status,
                    amount: captureInfo.amount?.value,
                    currency: captureInfo.amount?.currency_code,
                    payerName: `${payerInfo.name?.given_name || ""} ${payerInfo.name?.surname || ""}`.trim(),
                    payerEmail: payerInfo.email_address || "",
                },
            },
            { new: true }
        );

        // Optional: send email
        if (payment && payment.details?.payerEmail) {
            const reportRequest = await ReportRequest.findById(payment.reportRequest);
            sendCreditReportEmail(payment.details.payerEmail, { payment, reportRequest });
        }

        res.json({ success: true, payment });
    } catch (error) {
        console.error("capturePaypalPayment error:", error);
        res.status(500).json({ error: "Failed to capture PayPal payment" });
    }
};

// export const createPaypalOrder = async (req, res) => {
//     try {
//         const { userId, formData, currency = "USD" } = req.body;

//         if (!formData) {
//             return res.status(400).json({ error: "Missing required parameters" });
//         }

//         // 1️⃣ Save ReportRequest
//         const reportRequestData = {
//             targetCompany: {
//                 name: formData.companyName,
//                 address: formData.address,
//                 country: typeof formData.country === "string" ? formData.country : formData.country.label || "",
//                 state: formData.state,
//                 city: formData.city,
//                 postalCode: formData.postalCode,
//                 phone: formData.telephone || "",
//                 website: formData.website || "",
//             },
//             requester: userId,
//             requesterInfo: {
//                 name: formData.contactName,
//                 email: formData.contactEmail,
//                 phone: formData.contactPhone,
//                 optionalEmail: formData.optionalEmail || "",
//                 company: formData.contactCompany || "",
//                 website: formData.website || "",
//                 country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry.label || "",
//             },
//             agreementAccepted: formData.agreedToTerms || false,
//         };

//         const reportRequest = await ReportRequest.create(reportRequestData);

//         // 2️⃣ Pricing map
//         const pricingUSD = {
//             India: 49,
//             China: 79,
//             "Asia (excluding India & China)": 79,
//             USA: 69,
//             Canada: 69,
//             Europe: 79,
//             "Middle East": 79,
//             "Australia & New Zealand": 89,
//             Africa: 89,
//             Oceania: 89,
//             "Latin America": 99,
//             "Other Countries": 99,
//         };

//         // 3️⃣ Asian countries excluding India & China
//         const asianCountries = [
//             "Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Cambodia", "Georgia", "Indonesia",
//             "Japan", "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Malaysia", "Maldives",
//             "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Philippines",
//             "Qatar", "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria",
//             "Tajikistan", "Thailand", "Timor-Leste", "Turkmenistan", "United Arab Emirates",
//             "Uzbekistan", "Vietnam", "Yemen"
//         ];

//         // 4️⃣ Region detection
//         const normalize = (str) => str?.toString().trim().toLowerCase();
//         const countryName = formData.contactCountry?.label || formData.contactCountry || "";
//         const c = normalize(countryName);

//         let targetRegion = "Other Countries";
//         if (c === "india") targetRegion = "India";
//         else if (c === "china") targetRegion = "China";
//         else if (asianCountries.map(normalize).includes(c)) targetRegion = "Asia (excluding India & China)";
//         else if (["usa", "united states"].includes(c)) targetRegion = "USA";
//         else if (["canada"].includes(c)) targetRegion = "Canada";
//         else if (["europe", "uk", "germany", "france", "italy", "spain"].includes(c)) targetRegion = "Europe";
//         else if (["uae", "saudi arabia", "qatar", "kuwait", "bahrain", "oman"].includes(c)) targetRegion = "Middle East";
//         else if (["australia", "new zealand"].includes(c)) targetRegion = "Australia & New Zealand";
//         else if (["south africa", "nigeria", "egypt", "kenya", "morocco", "ethiopia"].includes(c)) targetRegion = "Africa";
//         else if (["fiji", "papua new guinea", "samoa", "tonga"].includes(c)) targetRegion = "Oceania";
//         else if (["brazil", "mexico", "argentina", "colombia", "chile", "peru"].includes(c)) targetRegion = "Latin America";

//         const amount = pricingUSD[targetRegion] || pricingUSD["Other Countries"];

//         // 5️⃣ Create PayPal Order
//         const request = new paypal.orders.OrdersCreateRequest();
//         request.prefer("return=representation");
//         request.requestBody({
//             intent: "CAPTURE",
//             purchase_units: [
//                 {
//                     amount: {
//                         currency_code: currency,
//                         value: amount.toString(),
//                     },
//                 },
//             ],
//         });

//         const order = await client.execute(request);

//         // 6️⃣ Save Payment record
//         await Payment.create({
//             user: userId,
//             reportRequest: reportRequest._id,
//             orderId: order.result.id,
//             amount,
//             currency,
//             status: "created",
//             method: "paypal",
//             details: {
//                 payerEmail: formData.contactEmail,
//                 payerName: formData.contactName,
//                 ...req.body.details,
//             },
//         });

//         res.json({ orderId: order.result.id, clientId: 'AbYmo3fDOLo929hTcfuSF5OAsTXMmvUiLalzVeXkqtWNVNlbaBP6erqJfy4bw1zP0MgBRoKhWUJ4LA6-', amount, currency });
//     } catch (error) {
//         console.error("createPaypalOrder error:", error);
//         res.status(500).json({ error: "Failed to create PayPal order" });
//     }
// };


// export const capturePaypalPayment = async (req, res) => {
//     try {
//         const { orderId } = req.body;

//         if (!orderId) {
//             return res.status(400).json({ error: "Missing orderId" });
//         }

//         // Capture PayPal order
//         const request = new paypal.orders.OrdersCaptureRequest(orderId);
//         request.requestBody({});
//         const capture = await client.execute(request);
//         const captureInfo = capture.result.purchase_units?.[0]?.payments?.captures?.[0] || {};
//         const payerInfo = capture.result.payer || {};

//         // Map to the model's details structure
//         const paymentDetails = {
//             // PayPal-specific
//             captureId: captureInfo.id,
//             status: captureInfo.status,
//             amount: captureInfo.amount?.value,
//             currency: captureInfo.amount?.currency_code,
//             payerName: payerInfo.name?.given_name && payerInfo.name?.surname
//                 ? `${payerInfo.name.given_name} ${payerInfo.name.surname}`
//                 : "",
//             payerEmail: payerInfo.email_address || "",
//             payerContact: payerInfo.phone?.phone_number?.national_number || "",

//             // Optional / future fields left blank for now
//             cardLast4: captureInfo.payment_source?.card?.last_digits || "",
//             cardType: captureInfo.payment_source?.card?.brand || "",
//             upiId: captureInfo.payment_source?.upi?.vpa || "",
//             upiTransactionId: captureInfo.payment_source?.upi?.transaction_id || "",
//             rrn: captureInfo.payment_source?.upi?.rrn || "",
//             bankName: captureInfo.payment_source?.bank?.name || "",
//             accountNumber: "",
//             ifsc: "",
//             chequeNumber: "",
//             acquirerData: captureInfo.payment_source || {},
//             description: captureInfo.description || "",
//             fee: captureInfo.seller_receivable_breakdown?.paypal_fee?.value || 0,
//             tax: captureInfo.seller_receivable_breakdown?.tax?.value || 0,
//             notes: captureInfo.custom_id ? [captureInfo.custom_id] : [],
//         };

//         // Update Payment document
//         const payment = await Payment.findOneAndUpdate(
//             { orderId },
//             {
//                 status: "paid",
//                 paymentId: captureInfo.id || orderId,
//                 paidAt: new Date(),
//                 method: "paypal",
//                 details: paymentDetails,
//             },
//             { new: true }
//         );

//         if (!payment) {
//             return res.status(404).json({ success: false, message: "Payment record not found" });
//         }

//         // 5️⃣ Fetch the related report request using reportRequest ID
//         const reportRequest = await ReportRequest.findById(payment.reportRequest);
//         if (!reportRequest) {
//             console.log("Report request not found for payment:", payment._id);
//         }

//         // 6️⃣ Send email if payerEmail exists, passing paymentDetails + reportRequest
//         if (paymentDetails.payerEmail) {
//             sendCreditReportEmail(paymentDetails.payerEmail, {
//                 paymentDetails,
//                 reportRequest,
//             })
//                 .then(() => console.log("Credit report email sent successfully"))
//                 .catch((err) => console.error("Failed to send credit report email:", err));
//         }

//         res.json({ success: true, message: "Payment captured", payment });
//     } catch (error) {
//         console.error("❌ PayPal capture error:", error);
//         res.status(500).json({ error: "Failed to capture PayPal payment" });
//     }
// };


export const handlePaymentCancelled = async (req, res) => {
    try {
        const { userId, orderId, data } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: "Missing orderId" });
        }

        // Mark payment as cancelled
        const payment = await Payment.findOneAndUpdate(
            { orderId },
            { status: 'cancelled', cancelledAt: new Date() },
            { new: true }
        );


        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found" });
        }

        // Fetch related report request
        const reportRequest = await ReportRequest.findById(payment.reportRequest);

        // 🔹 Fetch user email using the 'user' field in Payment
        const user = await User.findById(payment.user).select("email name");

        if (!user?.email) {
            console.warn("⚠️ No user email found for cancellation:", payment.user);
        } else {
            // 🔹 Send cancellation email
            await sendPaymentCancelledEmail(user.email, user.name, {
                reportRequest,
                orderId,
                userName: user.name || "User",
            });
        }

        res.json({ success: true, message: 'Cancellation processed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process cancellation' });
    }
};