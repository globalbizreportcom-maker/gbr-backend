import User from "../models/User.js";
import transporter from "./Nodemailer.js";

export const sendAbandonedCheckoutEmail = async (userId, visitorData) => {
  try {
    // ✅ Validate essential data
    if (!visitorData?.contactEmail) {
      console.error("❌ Missing contactEmail for user:", userId);
      return;
    }

    const recipientEmail = visitorData.contactEmail;
    const recipientName = visitorData?.contactName || "User";

    const dataToEncode = {
      userId,          // add userId
      ...visitorData   // merge the rest of the visitorData
    };

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
    // console.log(`📧 Reminder email successfully sent to: ${recipientEmail}`);
  } catch (error) {
    console.error("🚨 Error sending abandoned checkout email:", error.message);
  }
};
