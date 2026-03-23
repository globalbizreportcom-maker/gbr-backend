import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const serviceSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
});

const companyEditSchema = new Schema(
    {
        companyId: { type: String, required: true, unique: true }, // CIN
        userId: { type: Schema.Types.ObjectId, ref: "User" },      // Owner/editor (optional)

        header: {
            logo: { type: String, default: "" },     // URL
            banner: { type: String, default: "" },   // URL
            tagline: { type: String, default: "" },
            location: { type: String, default: "" },
        },

        stats: {
            founded: { type: String, default: "" },
            employees: { type: String, default: "" },
            // industry & status stay in API, not stored here
        },

        about: {
            content: { type: String, default: "" },
        },

        services: [serviceSchema],

        contact: {
            address: { type: String, default: "" },
            phone: { type: String, default: "" },
            email: { type: String, default: "" },
            website: { type: String, default: "" },
            workingHours: { type: String, default: "" },
        },
    },
    { timestamps: true } // createdAt & updatedAt
);

// If the model already exists (hot reload), use it; else create new
const CompanyEdit = models.CompanyEdit || model("CompanyEdit", companyEditSchema);

export default CompanyEdit;