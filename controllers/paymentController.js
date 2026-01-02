// backend/controllers/paymentController.js
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "../models/Payment.js";
import ReportRequest from "../models/ReportRequest.js";
import paypal from "@paypal/checkout-server-sdk";
import transporter from "../utils/Nodemailer.js";
import User from "../models/User.js";
import { agenda } from "../agenda.js";

// Move keys to .env in production
// const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_RLLP7cC84Ep2ms',
//     key_secret: process.env.RAZORPAY_KEY_SECRET || 'lCg8ZeIBhKQ93v9CDmZ4QrS2',
// });


const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_ROY0D3SgPD1pdG',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '2wUhDOwdqHHTkTGLCNZobfvr',
});

// async function sendCreditReportEmail(recipientEmail, { paymentDetails, reportRequest }) {
//     // Destructure requester info
//     const {
//         name,
//         email,
//         phone,
//         optionalEmail,
//         company: requesterCompany,
//         website: requesterWebsite,
//         country: requesterCountry
//     } = reportRequest?.requesterInfo || {};

//     // Destructure target company info
//     const {
//         name: targetCompanyName,
//         address: targetCompanyAddress,
//         country: targetCompanyCountry,
//         website: targetCompanyWebsite
//     } = reportRequest?.targetCompany || {};

//     try {

//         //  Email options
//         const mailOptions = {
//             from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
//             to: recipientEmail,
//             subject: "Your Credit Report Order is being Processed – GlobalBizReport.com",
//             html: `
//         <p>Dear ${name || 'User'},</p>
//         <p>Thank you for your order with GlobalBizReport.com (GBR). We appreciate your trust in our services.</p>

//         <p>We are pleased to confirm receipt of your request for a freshly investigated Business Credit Report. Our investigation team has initiated the process, and the completed report will be emailed to you at the earliest.</p>

//         <p>Kindly review the following inquiry details and confirm if the information is correct:</p>
//         <hr />
//         <p><strong>Company Inquiry Details – Company to Verify</strong><br/>
//         ${targetCompanyName || '(Company Name)'}<br/>
//         ${targetCompanyAddress || '(Address)'}<br/>
//         ${targetCompanyCountry || '(Country)'}<br/>
//         ${targetCompanyWebsite || '(Website)'}
//         </p>
//         <hr />

//         <p>At GlobalBizReport, we are committed to delivering 100% freshly investigated credit reports known for their exceptional quality, in-depth coverage, and accuracy. Our standard delivery timeframe for international reports is now just 1-3 business days.</p>

//         <p>Thank you once again for choosing GBR Reports as your trusted credit reporting partner. We look forward to supporting your ongoing credit risk assessment and business due diligence needs.</p>

//         <p>If you have any questions or need support with additional reports, please feel free to contact us — we’ll be happy to assist you.</p>

//         <p>Best Regards,</p>
//         <br/>
//         Team - GBR <br/>
//         <a href="https://www.globalbizreport.com">www.GlobalBizReport.com</a></p>

//         <hr />
//         <p><strong>About GlobalBizReport (GBR):</strong><br/>
//         GlobalBizReport is one of the world’s most trusted platforms for freshly investigated Business Credit Report and Due Diligence Reports, serving Corporates, SMEs, B2B Marketplaces, Financial Institutions, and Consulting Organisations in 220+ countries. Trusted by 20,000+ companies globally, GBR delivers fast, accurate, and in-depth business insights on companies worldwide.
//         </p>
//       `,
//         };

//         // Send email
//         const info = await transporter.sendMail(mailOptions);

//     } catch (err) {
//         console.error("Error sending email:", err);
//     }
// }


async function sendCreditReportEmail(recipientEmail, { paymentDetails, reportRequest, payment }) {

    // Destructure requester info
    const {
        name,
        email,
        phone,
        optionalEmail,
        company: requesterCompany,
        website: requesterWebsite,
        country: requesterCountry,
        gst,
    } = reportRequest?.requesterInfo || {};

    // Destructure target company info
    const {
        name: targetCompanyName,
        address: targetCompanyAddress,
        country: targetCompanyCountry,
        website: targetCompanyWebsite
    } = reportRequest?.targetCompany || {};

    // Calculate dynamic values
    let businessAmount = payment?.amount || 0;
    let gstAmount = payment?.tax || 0;
    let totalAmount = payment?.amount || 0;

    // Auto-calc only if currency is INR
    if (payment?.currency === "INR") {
        gstAmount = (totalAmount * 0.18).toFixed(2);
        businessAmount = (totalAmount - gstAmount).toFixed(2);
    } else {
        // No GST for non-INR
        gstAmount = null;
        businessAmount = totalAmount;
    }

    try {

        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: recipientEmail,
            subject: "Thanks for your Business Report order",
            html: `
<div style="
font-family: Arial, sans-serif; 
font-size: 14px; 
color: #333; 
max-width: 680px;      
margin: 0 auto;       
padding: 20px;         
">


<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
        <td align="center" style="padding-bottom: 15px;">
            <img 
                src="https://globalbizreport.com/images/logo-01.png" 
                alt="Global Biz Report"
                width="180"
                height='50'
                style="display: block;"
            />
        </td>
    </tr>
</table>


    <h2 style="text-align: center; margin-bottom: 5px;">Thanks for your Business Report order</h2>
    <p style="text-align: center; margin-top: 0;">
        Your order and payment details are below.
    </p>

    <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;" />

    <h3 style="text-align: center; margin-bottom: 10px;">YOUR ORDER DETAILS</h3>

    <table width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse;">
        <tr>
        <td width="50%" valign="top">
        <strong>Billed To</strong><br /><br />
    
        ${name && `${name}<br />`}
        ${email && `${email}<br />`}
        ${requesterCompany && `${requesterCompany}<br />`}
        ${requesterCountry && `${requesterCountry}<br />`}
        ${gst && `GSTIN: ${gst}<br />`}
    </td>
    
            <td width="50%" valign="top">
                <strong>Issued By</strong><br /><br />
                GLOBAL BIZ REPORT<br />
                TECHCENT INNOVATIONS<br />
                UNIT NO. M-1, 1ST FLOOR,<br />
                LANDMARK CYBER PARK,<br />
                SECTOR-67, GURUGRAM, HARYANA - 122102<br />
                GSTIN: 06AKRPB9332P1ZK
            </td>
        </tr>
    </table>

    <br />

    <h3 style="margin-top: 20px;">Invoice Details</h3>

    <table width="100%" cellpadding="10" cellspacing="0" border="1" style="border-collapse: collapse;">
        <tr>
            <td>Order ID: <strong>${payment?.orderId || '-'}</strong></td>
        </tr>
        <tr>
            <td>Date: <strong>${new Date(payment?.createdAt).toLocaleDateString() || '-'}</strong></td>
        </tr>
    </table>

    <br />

    <h3 style="margin-top: 20px;">Report Charges Summary</h3>

    <table width="100%" cellpadding="10" cellspacing="0" border="1" 
    style="border-collapse: collapse; text-align: left;">
    
        <tr>
            <td width="70%">Business Report</td>
            <td width="30%" align="right"> ${payment?.currency} ${businessAmount}</td>
        </tr>
    
        ${payment?.currency === "INR" ? `
        <tr>
                <td>IGST (18%)</td>
                <td align="right">INR ${gstAmount}</td>
            </tr>
            `
                    : ""
                }
    
        <tr>
            <td><strong>TOTAL</strong></td>
            <td align="right"><strong>${payment?.currency} ${totalAmount}</strong></td>
        </tr>
    
    </table>
    
    <br />

    <h3>CONTACT US</h3>
    <p>
        For any queries, <a href="https://www.globalbizreport.com/contact">click here to contact us</a>.
    </p>

</div>
`,
        };

        await transporter.sendMail(mailOptions);

    } catch (err) {
        console.error("Error sending email:", err);
    }
}



export const sendPaymentCancelledEmail = async (userId, visitorData) => {
    try {
        // ✅ Validate essential data
        if (!visitorData?.contactEmail) {
            // console.log(" Missing contactEmail for user:", userId);
            return;
        }

        const recipientEmail = visitorData.contactEmail;
        const recipientName = visitorData?.contactName || "User";

        const dataToEncode = {
            userId: userId,          // add userId
            ...visitorData   // merge the rest of the visitorData
        };

        // console.log(userId);
        const encodedData = encodeURIComponent(
            Buffer.from(JSON.stringify(dataToEncode)).toString("base64")
        );

        const resumeUrl = `https://www.globalbizreport.com/email-checkout?data=${encodedData}`;


        // ✅ Updated Email Template
        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: recipientEmail,
            subject: "Complete Your Order – GlobalBizReport.com",
            html: `
          <p>Dear ${recipientName},</p>
  
          <p>Thank you for your interest to inquire for a Freshly Investigated Credit Report from <a href="https://www.globalbizreport.com" target="_blank">www.GlobalBizReport.com</a> (GBR). We want to assure you that you made the right choice. GBR is one of the most reliable business services platforms providing Freshly Investigated Business Credit Reports to Corporates, SMEs, B2B Marketplaces, Financial Institutes, Global Consultancy & Market Research companies worldwide.</p>
  
          <p>We noticed that you couldn't complete the transaction due to some technical problem. We are sorry for the inconvenience. But no worries!</p>
  
          <p>In order to save your time, we give below a link to continue from where you left.</p>
  
          <p>
          <a href="${resumeUrl}" 
             style="display:inline-block;padding:10px 20px;background:#FF6600;color:#fff;text-decoration:none;border-radius:5px;">
             Click here to Complete Your Order
          </a>
        </p>
        
          <p>GBR offers its service in over 220+ countries and GBR Credit Reports gives you full picture of company's reliability, registration data, financial health, credit worthiness check, credit rating score, Directors Info, details on any Negative information and much more.</p>
  
          <p>Once again thank you for your interest in considering GlobalBizReport as your Credit Reporting Partner. We look forward to receiving your order and to serving you for your future credit reporting needs.</p>
  
          <p>For any queries, please feel free to contact us at <a href="mailto:support@globalbizreport.com">support@globalbizreport.com</a></p>
  
          <p>Regards,<br/>
          <b>Team - GBR</b></p>
  
          <p><em>Click here in case you want to view a sample report. Please note that the contents of the report like financial statements etc. are subject to availability depending on the local government policies and corporate information disclosure of the subject/country.</em></p>
        `,
        };

        // ✅ Send the email
        await transporter.sendMail(mailOptions);
        console.log(`📧 Reminder email successfully sent to: ${recipientEmail}`);
    } catch (error) {
        console.error("🚨 Error sending abandoned checkout email:", error.message);
    }
};


// 🔹 Create Razorpay Order & ReportRequest
export const createOrder = async (req, res) => {
    try {
        const { amount, userId, formData } = req.body;

        if (!amount || !formData || !userId) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // 1️⃣ Save ReportRequest
        const reportRequestData = {
            companyType: formData.companyType,
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
                optionalEmail: formData.optionalEmail || '',
                company: formData.contactCompany || '',
                state: formData.contactState || "",
                gst: formData.companyGst || '',
                website: formData.website || '',
                country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry.label,
            },
            agreementAccepted: formData.agreedToTerms || false,
        };

        const reportRequest = await ReportRequest.create(reportRequestData);

        // // 🕒 Schedule abandoned checkout reminder
        // await agenda.schedule("in 1 minutes", "send abandoned checkout email", {
        //     userId,
        //     reportRequestId: reportRequest._id,
        // });

        // 2️⃣ Pricing maps
        const pricingINR = {
            India: 4915,
            China: 7924,
            "Asia (excluding India & China)": 7924,
            USA: 5918,
            Canada: 5918,
            Europe: 6921,
            "Middle East": 6921,
            "Australia & New Zealand": 8927,
            Africa: 7924,
            Oceania: 8927,
            "Latin America": 8927,
            // testing
            "Christmas Island": 1,
            "Other Countries": 8927,
        };

        const pricingUSD = {
            India: 49,
            China: 79,
            "Asia (excluding India & China)": 79,
            USA: 59,
            Canada: 59,
            Europe: 69,
            "Middle East": 69,
            "Australia & New Zealand": 89,
            Africa: 79,
            Oceania: 89,
            "Latin America": 89,
            // testing
            "Christmas Island": 1,
            "Other Countries": 89,
        };

        // 3️⃣ Region detection (frontend logic exactly)

        const normalize = (str) => str?.toString().trim().toLowerCase();


        const getRegion = (country) => {

            const asiaExcludingIndiaChina = ["Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Myanmar", "Cambodia", "East Timor", "Hong Kong S.A.R.", "Indonesia", "Japan", "Kazakhstan", "North Korea", "South Korea", "Kyrgyzstan", "Laos", "Malaysia", "Maldives", "Mongolia", "Nepal", "Pakistan", "Philippines", "Russia", "Singapore", "Sri Lanka", "Tajikistan", "Taiwan", "Thailand", "Turkmenistan", "Uzbekistan", "Vietnam"].map(normalize);
            const australiaNZ = ["Australia", "New Zealand"].map(normalize);
            const middleEast = ["Bahrain", "Iran", "Iraq", "Israel", "Jordan", "Kuwait", "Lebanon", "Oman", "Qatar", "Saudi Arabia", "Syria", "Turkey", "Turkmenistan", "United Arab Emirates", "Yemen"].map(normalize);
            const latinAmerica = ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru"].map(normalize);
            const africa = [
                "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
                "Cameroon", "Cape Verde", "Central African Republic", "Chad", "Comoros",
                "Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Ethiopia",
                "Gabon", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau",
                "Cote D'Ivoire (Ivory Coast)", "Kenya", "Lesotho", "Liberia", "Libya",
                "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
                "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
                "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
                "Somalia", "South Africa", "Sudan", "Swaziland", "Tanzania", "Togo",
                "Tunisia", "Uganda", "Zambia", "Zimbabwe"
            ].map(normalize);
            const oceania = [
                "Fiji Islands",
                "Kiribati",
                "Marshall Islands",
                "Micronesia",
                "Nauru",
                "Palau",
                "Papua new Guinea",
                "Samoa",
                "Solomon Islands",
                "Tonga",
                "Tuvalu",
                "Vanuatu"
            ].map(normalize);
            const europe = [
                "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus", "Belgium",
                "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
                "Denmark", "Estonia", "Finland", "France", "Georgia", "Germany", "Greece",
                "Hungary", "Iceland", "Ireland", "Italy", "Latvia", "Liechtenstein",
                "Lithuania", "Luxembourg", "Macedonia", "Malta", "Moldova", "Monaco",
                "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
                "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
                "United Kingdom", "Ukraine", "Vatican City State (Holy See)"
            ].map(normalize);



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

            if (c === "christmas island") return "Christmas Island";

            // if (["europe", "uk", "germany", "france", "italy", "spain"].includes(c)) return "Europe";
            if (europe.map(x => x.toLowerCase()).includes(c)) return "Europe";

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
        res.json({ orderId: order?.id || null, amount: totalAmount, currency, key: razorpay.key_id });
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
                payment,
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


// live
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

        if (!formData || !userId) return res.status(400).json({ error: "Missing required fields" });

        // 1️⃣ Save ReportRequest in DB
        const reportRequestData = {
            companyType: formData.companyType,
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
                state: formData.contactState || "",
                gst: formData.companyGst || '',
                website: formData.website || "",
                country: typeof formData.contactCountry === "string" ? formData.contactCountry : formData.contactCountry?.label || "",
            },
            agreementAccepted: formData.agreedToTerms || false,
        };

        const reportRequest = await ReportRequest.create(reportRequestData);

        const pricingINR = {
            India: 4915,
            China: 7924,
            "Asia (excluding India & China)": 7924,
            USA: 5918,
            Canada: 5918,
            Europe: 6921,
            "Middle East": 6921,
            "Australia & New Zealand": 8927,
            Africa: 7924,
            Oceania: 8927,
            "Latin America": 8927,
            // testing
            "Christmas Island": 1,
            "Other Countries": 8927,
        };

        const pricingUSD = {
            India: 49,
            China: 79,
            "Asia (excluding India & China)": 79,
            USA: 59,
            Canada: 59,
            Europe: 69,
            "Middle East": 69,
            "Australia & New Zealand": 89,
            Africa: 79,
            Oceania: 89,
            "Latin America": 89,
            // testing
            "Christmas Island": 1,
            "Other Countries": 89,
        };



        // 4️⃣ Helper to normalize strings
        const normalize = str => str?.toString().trim().toLowerCase();

        // 5️⃣ Get countries
        const payerCountry = normalize(formData.contactCountry?.label || formData.contactCountry);
        const targetCountry = normalize(formData.country?.label || formData.country);

        // 6️⃣ Determine currency
        const currency = payerCountry === "india" ? "INR" : "USD";

        // 7️⃣ Determine region for pricing (based on target company)

        const getRegion = (country) => {
            const asiaExcludingIndiaChina = ["Afghanistan", "Bangladesh", "Bhutan", "Brunei", "Myanmar", "Cambodia", "East Timor", "Hong Kong S.A.R.", "Indonesia", "Japan", "Kazakhstan", "North Korea", "South Korea", "Kyrgyzstan", "Laos", "Malaysia", "Maldives", "Mongolia", "Nepal", "Pakistan", "Philippines", "Russia", "Singapore", "Sri Lanka", "Tajikistan", "Taiwan", "Thailand", "Turkmenistan", "Uzbekistan", "Vietnam"].map(normalize);
            const australiaNZ = ["Australia", "New Zealand"].map(normalize);
            const middleEast = ["Bahrain", "Iran", "Iraq", "Israel", "Jordan", "Kuwait", "Lebanon", "Oman", "Qatar", "Saudi Arabia", "Syria", "Turkey", "Turkmenistan", "United Arab Emirates", "Yemen"].map(normalize);
            const latinAmerica = ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru"].map(normalize);
            const africa = [
                "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
                "Cameroon", "Cape Verde", "Central African Republic", "Chad", "Comoros",
                "Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Ethiopia",
                "Gabon", "The Gambia", "Ghana", "Guinea", "Guinea-Bissau",
                "Cote D'Ivoire (Ivory Coast)", "Kenya", "Lesotho", "Liberia", "Libya",
                "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
                "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
                "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
                "Somalia", "South Africa", "Sudan", "Swaziland", "Tanzania", "Togo",
                "Tunisia", "Uganda", "Zambia", "Zimbabwe"
            ].map(normalize);
            const oceania = [
                "Fiji Islands",
                "Kiribati",
                "Marshall Islands",
                "Micronesia",
                "Nauru",
                "Palau",
                "Papua new Guinea",
                "Samoa",
                "Solomon Islands",
                "Tonga",
                "Tuvalu",
                "Vanuatu"
            ].map(normalize);
            const europe = [
                "Albania", "Andorra", "Armenia", "Austria", "Azerbaijan", "Belarus", "Belgium",
                "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
                "Denmark", "Estonia", "Finland", "France", "Georgia", "Germany", "Greece",
                "Hungary", "Iceland", "Ireland", "Italy", "Latvia", "Liechtenstein",
                "Lithuania", "Luxembourg", "Macedonia", "Malta", "Moldova", "Monaco",
                "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
                "San Marino", "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland",
                "United Kingdom", "Ukraine", "Vatican City State (Holy See)"
            ].map(normalize);

            const c = normalize(country);
            if (!c) return "Other Countries";
            if (c === "india") return "India";
            if (c === "china") return "China";

            // testing
            if (c === "christmas island") return "Christmas Island";

            if (asiaExcludingIndiaChina.includes(c)) return "Asia (excluding India & China)";
            if (australiaNZ.includes(c)) return "Australia & New Zealand";
            if (middleEast.includes(c)) return "Middle East";
            if (latinAmerica.includes(c)) return "Latin America";
            if (africa.includes(c)) return "Africa";
            if (oceania.includes(c)) return "Oceania";
            if (["usa", "united states"].includes(c)) return "USA";
            if (["canada"].includes(c)) return "Canada";
            // if (["europe", "uk", "germany", "france", "italy", "spain"].includes(c)) return "Europe";
            if (europe.map(x => x.toLowerCase()).includes(c)) return "Europe";

            return "Other Countries";
        };

        const targetRegion = getRegion(targetCountry);


        // let targetRegion = "Other Countries";
        // if (targetCountry === "india") targetRegion = "India";
        // else if (targetCountry === "china") targetRegion = "China";
        // else if (asianCountries.map(normalize).includes(targetCountry)) targetRegion = "Asia (excluding India & China)";
        // else if (["usa", "united states"].includes(targetCountry)) targetRegion = "USA";
        // else if (["canada"].includes(targetCountry)) targetRegion = "Canada";
        // else if (["europe", "uk", "germany", "france", "italy", "spain", "Georgia",].includes(targetCountry)) targetRegion = "Europe";
        // else if (["uae", "saudi arabia", "qatar", "kuwait", "bahrain", "oman"].includes(targetCountry)) targetRegion = "Middle East";
        // else if (["australia", "new zealand"].includes(targetCountry)) targetRegion = "Australia & New Zealand";
        // else if (["south africa", "nigeria", "egypt", "kenya", "morocco", "ethiopia"].includes(targetCountry)) targetRegion = "Africa";
        // else if (["Fiji Islands", "papua new guinea", "samoa", "tonga"].includes(targetCountry)) targetRegion = "Oceania";
        // else if (["brazil", "mexico", "argentina", "colombia", "chile", "peru"].includes(targetCountry)) targetRegion = "Latin America";

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
            key: currency === "INR" ? razorpay.key_id : null,
        });

    } catch (error) {
        res.status(500).json({ error: "Failed to create PayPal order" });
    }
};


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
            sendCreditReportEmail(payment.details.payerEmail, { payment, reportRequest, payment });
        }

        res.json({ success: true, payment });
    } catch (error) {
        res.status(500).json({ error: "Failed to capture PayPal payment" });
    }
};

export const handlePaymentCancelled = async (req, res) => {
    try {
        const { userId, orderId, data } = req.body;

        console.log(userId, orderId,);

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Missing orderId" });
        }

        // 🔹 Step 1: Update payment status
        const payment = await Payment.findOneAndUpdate(
            { orderId },
            { status: "cancelled", cancelledAt: new Date() },
            { new: true }
        ).populate("reportRequest user"); // populate to access details directly

        if (!payment) {
            return res.status(404).json({ success: false, message: "Payment record not found" });
        }

        // 🔹 Step 2: Extract report and user info
        const report = payment.reportRequest;
        const user = payment.user;

        if (!report) {
            return res.status(404).json({ success: false, message: "Report request not found" });
        }

        // Extract target company and requester info
        const targetCompany = report.targetCompany;
        const requesterInfo = report.requesterInfo;

        // 🔹 Step 3: Prepare email data
        const emailData = {
            user: payment?.user?._id,
            companyName: targetCompany?.name || "",
            address: targetCompany?.address || "",
            city: targetCompany?.city || "",
            state: targetCompany?.state || "",
            country: targetCompany?.country || "",
            postalCode: targetCompany?.postalCode || "",
            telephone: targetCompany?.phone || "",
            website: targetCompany?.website || "",
            contactName: requesterInfo?.name || "",
            contactEmail: requesterInfo?.email || "",
            contactCountry: requesterInfo?.country || "",
            contactState: requesterInfo?.state || "",
            companyGst: requesterInfo?.gst || "",
            contactPhone: requesterInfo?.phone || "",
            contactCompany: requesterInfo?.company || "",
            optionalEmail: requesterInfo?.optionalEmail || "",
            paymentAmount: payment.amount,
            currency: payment.currency,
        };

        // 🔹 Step 4: Send cancellation email
        if (user?.email) {
            await sendPaymentCancelledEmail(userId, emailData);
        } else {
            console.log(" No user email found for cancellation:", userId);
        }

        res.json({ success: true, message: "Cancellation processed" });
    } catch (error) {
        res.status(500).json({ error: "Failed to process cancellation" });
    }
};

