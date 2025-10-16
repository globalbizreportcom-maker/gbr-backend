import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
    {
        CIN: { type: String, required: true, unique: true, trim: true }, // primary unique key
        CompanyName: { type: String, required: true, trim: true },
        CompanyStateCode: { type: String, trim: true }, // state
        CompanyROCcode: { type: String, trim: true },
        CompanyCategory: { type: String, trim: true },
        CompanySubCategory: { type: String, trim: true },
        CompanyClass: { type: String, trim: true },
        AuthorizedCapital: { type: Number, default: 0 },
        PaidupCapital: { type: Number, default: 0 },
        CompanyRegistrationdate_date: { type: Date },
        Registered_Office_Address: { type: String, trim: true },
        Listingstatus: { type: String, trim: true },
        CompanyStatus: { type: String, trim: true },
        CompanyIndianOrForeign: { type: String, trim: true },
        nic_code: { type: String, trim: true },
        CompanyIndustrialClassification: { type: String, trim: true },
    },
    { timestamps: true }
);


// 1. Composite index: state + company name
companySchema.index({ CompanyStateCode: 1, CompanyName: 1 });

// 2. Company name alone (for searching across all states)
companySchema.index({ CompanyName: 1 });

// 3. Optional: text index for partial/keyword search
companySchema.index({ CompanyName: "text" });

export const Company = mongoose.models.Company || mongoose.model("Company", companySchema);
