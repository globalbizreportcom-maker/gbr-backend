import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js"; // import the mongoose model

const registrationRouter = express.Router();

// POST /register
registrationRouter.post("/form-submit", async (req, res) => {
    try {
        const { name, email, phone, country, password, company } = req.body;

        // 1. Validate input
        if (!name || !email || !country) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        // 2. Check if email or phone already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }],
        });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email or phone already registered" });
        }

        // 3. Hash password
        let hashedPassword = password; // fallback, in case no hashing is needed
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }


        // 4. Save new user
        const newUser = new User({
            name,
            email,
            phone,
            country,
            password: hashedPassword,
            company,
        });

        await newUser.save();

        res.status(201).json({ success: true, message: "User registered successfully" });
    } catch (error) {
        console.error("❌ Registration error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default registrationRouter;
