import express from "express";
import { loginAdmin } from "./loginAdmin.js";
import { verifyAdmin } from "./middleware/verifyAdmin.js";
import ReportRequest from "../../models/ReportRequest.js";
import Payment from "../../models/Payment.js";
import User from "../../models/User.js";
import cloudinary from "../../config/cloudinary.js";
import ReportFile from "../../models/ReportFile.js";
import multer from "multer";
import streamifier from "streamifier";
import path from 'path';
import Contact from "../../models/Contact.js";
import csvParser from "fast-csv";
import { Company } from "../../models/company.js";
import stream from "stream";
import transporter from "../../utils/Nodemailer.js";
import axios from "axios";

const adminRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // keep in memory

// Helper to stream buffer to Cloudinary
function uploadToCloudinary(buffer, folder, originalName) {
    let ext = path.extname(originalName); // e.g. ".pdf"
    const nameWithoutExt = path.basename(originalName, ext);

    // Clean filename: remove spaces, special chars except _
    const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, "_");

    const publicId = `${folder}/${safeName}-${Date.now()}`;

    return new Promise((resolve, reject) => {
        const cldStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "auto",
                public_id: publicId,
                type: "upload"
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );

        streamifier.createReadStream(buffer).pipe(cldStream);
    });
}


adminRouter.post("/protected", verifyAdmin, (req, res) => {
    res.json({ admin: req.admin }); // ✅ send admin data
});

// Login route
adminRouter.post("/login", loginAdmin);

//  protected route (dashboard)
adminRouter.get("/dashboard", verifyAdmin, (req, res) => {
    res.json({ message: `Welcome Admin ${req.admin.id}`, role: req.admin.role });
});

// GET all report requests
adminRouter.get("/report-requests", verifyAdmin, async (req, res) => {
    try {
        const reports = await ReportRequest.find()
            .populate("requester", "name email")
            .sort({ createdAt: -1 });

        // Attach paid payments
        const reportsWithPaidPayment = await Promise.all(
            reports.map(async (report) => {
                const payment = await Payment.findOne({ reportRequest: report._id, status: "paid" });
                if (!payment) return null; // skip if not paid
                return { ...report.toObject(), payment };
            })
        );
        // Filter out reports without paid payment
        const filteredReports = reportsWithPaidPayment.filter(r => r !== null);

        res.json({ success: true, reports: filteredReports });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch reports" });
    }
});

//dash stats
adminRouter.get("/dashboard-stats", verifyAdmin, async (req, res) => {
    try {
        // Total Users
        const totalUsers = await User.countDocuments();

        // Fetch all paid payments with their linked report requests
        const payments = await Payment.find({ status: "paid" })
            .populate("reportRequest"); // make sure ref is correct in your schema

        // Total Orders = count of paid payments
        const totalOrders = payments.length;

        // Revenue split by currency
        let totalRevenueINR = 0;
        let totalRevenueUSD = 0;

        // Revenue = sum of amounts
        payments.forEach((p) => {
            if (p.currency === "INR") {
                totalRevenueINR += p.total || p.amount || 0;
            }
            else if (p.currency === "USD") {
                totalRevenueUSD += p.total || p.amount || 0;
            }
        });

        // Split by report status
        let pendingOrders = 0;
        let deliveredOrders = 0;

        payments.forEach((payment) => {
            const report = payment.reportRequest;
            if (report) {
                if (report.status === "delivered") {
                    deliveredOrders++;
                } else {
                    pendingOrders++;
                }
            }
        });

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalOrders,
                pendingOrders,
                deliveredOrders,
                revenue: {
                    INR: totalRevenueINR,
                    USD: totalRevenueUSD,
                }
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch dashboard stats" });
    }
});

// Update report status

async function updateReportStatus(id, status) {
    // Validate status
    // const STATUS_TABS = ["initiated", "in-progress", "completed", "delivered"];
    // if (!STATUS_TABS.includes(status)) {
    //     return { success: false, message: "Invalid status" };
    // }

    try {
        const report = await ReportRequest.findById(id);
        if (!report) {
            return { success: false, message: "Report not found" };
        }

        report.status = status;
        await report.save();

        return { success: true, report };
    } catch (error) {
        return { success: false, message: "Server error" };
    }
}

export const getReportDetailsById = async (id) => {
    try {
        const report = await ReportRequest.findById(id);

        if (!report) return null;

        // Fetch report file linked to this report request
        const reportFile = await ReportFile.findOne({
            reportRequest: id
        }).select("fileUrl");

        const recipientName = report.requesterInfo?.name || "Valued Customer";
        const recipientEmail = report.requesterInfo?.email;

        const companyDetails = {
            companyName: report.targetCompany?.name || "",
            address: report.targetCompany?.address || "",
            city: report.targetCompany?.city || "",
            state: report.targetCompany?.state || "",
            country: report.targetCompany?.country || "",
            postalCode: report.targetCompany?.postalCode || "",
            telephone: report.targetCompany?.phone || "",
            website: report.targetCompany?.website || "",
        };

        return {
            recipientName,
            recipientEmail,
            companyDetails,
            reportFileUrl: reportFile?.fileUrl || null,
        };
    } catch (err) {
        console.error("Error fetching report details:", err);
        return null;
    }
};

const sendReportEmail = async ({ recipientName, recipientEmail, companyDetails, reportFile }) => {
    if (!recipientEmail) return;

    // Helper to conditionally render table rows
    const renderRow = (label, value) =>
        value ? `<tr><td style="padding: 8px; font-weight: bold;">${label}</td><td style="padding: 8px;">${value}</td></tr>` : "";

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
        <td align="left" style="padding-bottom: 15px;">
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
        <h2>Business Credit Report of ${companyDetails.companyName || ""}</h2>
        <p>Dear ${recipientName || ""},</p>
        <p>Thank you for choosing GlobalBizReport.com (GBR) and taking the time to order a freshly investigated Business Credit Report.</p>
        <p>As requested, please find attached the freshly investigated credit report for the following company:</p>
        <hr/>
        <p>Company Inquiry Details – Company to Verify</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          ${renderRow("COMPANY NAME", companyDetails.companyName)}
          ${renderRow("ADDRESS", companyDetails.address)}
          ${renderRow("CITY", companyDetails.city)}
          ${renderRow("STATE", companyDetails.state)}
          ${renderRow("COUNTRY", companyDetails.country)}
          ${renderRow("TELEPHONE", companyDetails.telephone)}
          ${renderRow("WEBSITE", companyDetails.website)}
        </table>
        <hr/>
        <p>Please note that GBR Reports are 100% freshly investigated and known for their exceptional quality, depth, and accuracy.</p>
        <p>Thank you once again for considering GBR as your trusted credit reporting partner. We look forward to supporting your ongoing credit risk assessment and due diligence requirements.</p>
        <p>Should you have any further questions or need assistance placing an order, please feel free to contact us — we’ll be happy to assist you.</p>
        <p>Best regards,<br/><strong>GBR</strong><br/>Team, Global Sales<br/><a href="https://www.globalbizreport.com">www.GlobalBizReport.com</a></p>
        <hr/>
        <p>About GlobalBizReport (GBR):</p>
        <p>GlobalBizReport is one of the most trusted business services platforms, providing freshly investigated and detailed Business Credit Reports and Due Diligence Reports to Corporates, SMEs, B2B Marketplaces, Financial Institutions, Global Consulting Firms, and Market Research Companies worldwide.</p>
        <p>Trusted by over 20,000 companies globally, GBR offers 100% freshly investigated credit reports with unmatched global reach across 220+ countries.</p>
      </div>
    `;

    // Build attachments array if reportFile exists
    const attachments = [];

    if (reportFile) {
        try {
            const response = await axios.get(reportFile, {
                responseType: "arraybuffer",
                timeout: 15000, // avoid hanging
            });

            attachments.push({
                filename: `${companyDetails.companyName || "Report"}.pdf`,
                content: Buffer.from(response.data),
                contentType: "application/pdf",
            });
        } catch (fileErr) {
            console.log("❌ Failed to fetch report file:", fileErr.message);
            // Decide: continue WITHOUT attachment or fail
            throw new Error("Unable to download report file");
        }
    }


    await transporter.sendMail({
        from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
        to: recipientEmail,
        subject: `Business Credit Report of ${companyDetails.companyName || ""}`,
        html: htmlContent,
        attachments,
    });
};

async function sendInProgessEmail({ result }) {

    // Destructure requester info
    const {
        name,
        email,
        company: requesterCompany,
        website: requesterWebsite,
        country: requesterCountry
    } = result?.report?.requesterInfo || {};

    // Destructure target company info
    const {
        name: targetCompanyName,
        address: targetCompanyAddress,
        country: targetCompanyCountry,
        website: targetCompanyWebsite
    } = result?.report?.targetCompany || {};

    try {

        //  Email options
        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: email,
            subject: "Your Credit Report Order is being Processed – GlobalBizReport.com",
            html: `
        <p>Dear ${name || 'User'},</p>
        <p>Thank you for your order with GlobalBizReport.com (GBR). We appreciate your trust in our services.</p>

        <p>We are pleased to confirm receipt of your request for a freshly investigated Business Credit Report. Our investigation team has initiated the process, and the completed report will be emailed to you at the earliest.</p>

        <p>Kindly review the following inquiry details and confirm if the information is correct:</p>
        <hr />
        <p><strong>Company Inquiry Details – Company to Verify</strong></p>
        <table cellpadding="4" cellspacing="0" border="0" style="width:100%; font-size:14px; color:#333;">
          ${targetCompanyName && `
          <tr>
            <td style="font-weight:bold; width:150px;">Name:</td>
            <td>${targetCompanyName}</td>
          </tr>`}
        
          ${targetCompanyAddress && `
          <tr>
            <td style="font-weight:bold;">Address:</td>
            <td>${targetCompanyAddress}</td>
          </tr>`}
        
          ${targetCompanyCountry && `
          <tr>
            <td style="font-weight:bold;">Country:</td>
            <td>${targetCompanyCountry}</td>
          </tr>`}
        
          ${targetCompanyWebsite && `
          <tr>
            <td style="font-weight:bold;">Website:</td>
            <td>${targetCompanyWebsite}</td>
          </tr>`}
        </table>
        <hr style="border:0; border-top:1px solid #ccc; margin:10px 0;" />
        

        <p>At GlobalBizReport, we are committed to delivering 100% freshly investigated credit reports known for their exceptional quality, in-depth coverage, and accuracy. Our standard delivery timeframe for international reports is now just 1-3 business days.</p>

        <p>Thank you once again for choosing GBR Reports as your trusted credit reporting partner. We look forward to supporting your ongoing credit risk assessment and business due diligence needs.</p>

        <p>If you have any questions or need support with additional reports, please feel free to contact us — we’ll be happy to assist you.</p>

        <p>Best Regards,</p>
        <br/>
        Team - GBR <br/>
        <a href="https://www.globalbizreport.com">www.GlobalBizReport.com</a></p>

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


adminRouter.put("/update/report-requests/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        // 1️⃣ Update the report status
        const result = await updateReportStatus(id, status);

        if (!result.success) {
            return res.status(400).json(result);
        }

        if (status === "delivered") {
            try {
                const reportDetails = await getReportDetailsById(id);

                if (reportDetails) {
                    await sendReportEmail({
                        recipientName: reportDetails.recipientName,
                        recipientEmail: reportDetails.recipientEmail,
                        companyDetails: reportDetails.companyDetails,
                        reportFile: reportDetails.reportFileUrl,
                    });
                }
            } catch (error) {
                console.log(" Error while sending report email:", error);
                throw new Error("Failed to send report email");
            }
        }


        if (status === "in-progress") {
            // in progress email sending function
            await sendInProgessEmail({ result });
        }

        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Failed to update status or send email" });
    }
});



// Get all users
adminRouter.get("/users", verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }); // latest first
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
});

// upload reports
adminRouter.post("/report-files/upload", verifyAdmin, upload.single("file"), async (req, res) => {
    try {
        const { reportRequestId } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        // Upload directly from buffer
        const result = await uploadToCloudinary(req.file.buffer, "reports", req.file.originalname);

        // Save to DB
        const newFile = new ReportFile({
            reportRequest: reportRequestId,
            fileUrl: result.secure_url,
        });
        await newFile.save();

        res.json({ success: true, file: newFile });
    } catch (error) {
        res.status(500).json({ success: false, message: "Upload failed" });
    }
});

// payments
adminRouter.get("/payments", verifyAdmin, async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate({
                path: "user",
                select: "name email phone country company", // Requester/User info
            })
            .populate({
                path: "reportRequest",
                select: "companyType targetCompany requesterInfo status createdAt", // Include both requesterInfo & targetCompany
            })
            .sort({ createdAt: -1 });
        res.status(200).json(payments);
    } catch (err) {
        console.error("Error fetching payments:", err);
        res.status(500).json({ message: "Error fetching payments" });
    }
});

// GET all contacts, sorted by latest
adminRouter.get("/contacts", verifyAdmin, async (req, res) => {
    try {
        const contacts = await Contact.find()
            .sort({ createdAt: -1 })
            .select("fullName email subject messages createdAt"); // select essential fields
        res.status(200).json(contacts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching contacts" });
    }
});

// GET /api/admin/contacts/thread/:email
adminRouter.get("/contacts/thread/:email", verifyAdmin, async (req, res) => {
    try {
        const { email } = req.params;
        const contact = await Contact.findOne({ email });

        if (!contact) return res.status(404).json({ message: "Contact not found" });

        // Mark all user messages as read
        contact.messages = contact.messages.map((msg) =>
            msg.sender === "user" ? { ...msg.toObject(), read: true } : msg
        );

        await contact.save();

        res.status(200).json({ contact });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// POST /api/admin/contacts/:email/reply
adminRouter.post("/contacts/thread/:email/reply", verifyAdmin, async (req, res) => {
    try {
        const { message } = req.body;
        const email = req.params.email;

        const contact = await Contact.findOne({ email });
        if (!contact) return res.status(404).json({ message: "Contact not found" });

        contact.messages.push({ sender: "admin", message });
        await contact.save();

        // 🔹 Compose email
        const mailOptions = {
            from: '"GlobalBizReport" <no-reply@globalbizreport.com>',
            to: email,
            subject: "Reply from GlobalBizReport",
            html: `
                <p>Hello ${contact.fullName},</p>
                <blockquote style="border-left:2px solid #ccc; padding-left:10px;">${message}</blockquote>
                <p>Thank you for contacting us!</p>
            `,
        };

        // 🔹 Send email
        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


async function getCompanyCountByState(state) {
    if (!state) throw new Error("State is required");

    try {
        const count = await Company.countDocuments({ CompanyStateCode: state });
        return count;
    } catch (err) {
        console.error("Error fetching company count:", err);
        throw err;
    }
}

// getCompanyCountByState("andhra pradesh");


async function viewLastDocument() {
    try {
        // Sort by creation time descending and get the last inserted document
        const lastDoc = await Company.findOne().sort({ createdAt: -1 });
    } catch (err) {
        console.error(err);
    }
}

// viewLastDocument();

async function deleteAndhraPradeshCompanies() {
    try {
        const result = await Company.deleteMany({ CompanyStateCode: { $regex: /^Andhra Pradesh$/i } });
    } catch (err) {
        console.error("Error deleting companies:", err);
    }
}

// Call the function
// deleteAndhraPradeshCompanies();


// Logout
adminRouter.post("/logout", verifyAdmin, (req, res) => {
    // Clear the cookie
    res.clearCookie("gbr_admin", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    res.json({ message: "Logged out successfully" });
});


export default adminRouter;
