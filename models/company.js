import mongoose from "mongoose";

// Define schema (dynamic fields allowed because data.gov.in varies)
const companySchema = new mongoose.Schema({}, { strict: false });

// Export model
export const Company = mongoose.model("Company", companySchema);
