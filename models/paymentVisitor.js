// backend/models/paymentVisitorModel.js
import mongoose from "mongoose";

const paymentVisitorSchema = new mongoose.Schema(
    {
        companyName: String,
        address: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
        telephone: String,
        website: String,
        contactName: String,
        contactEmail: String,
        contactCountry: String,
        contactPhone: String,
        contactCompany: String,
        companyGst: String,
        optionalEmail: String,
        paymentAmount: String,   // ✅ must exist
        currency: String,
        agreedToTerms: { type: Boolean, default: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

export default mongoose.model("PaymentVisitor", paymentVisitorSchema);
