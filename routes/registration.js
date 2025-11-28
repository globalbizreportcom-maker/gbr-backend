import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js"; // import the mongoose model
import jwt from "jsonwebtoken";

const registrationRouter = express.Router();

// POST /register
registrationRouter.post("/form-submit", async (req, res) => {
    try {
        const { name, email, phone, country, password, company, state, gst } = req.body;

        // 1. Validate input
        if (!name || !email || !country?.value) {
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
            country: country?.label,
            state: state?.label,
            password: hashedPassword,
            company,
            gstin: gst || ''
        });

        await newUser.save();

        // 5️⃣ Generate JWT token
        const token = jwt.sign(
            { email: newUser.email, id: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        // 6️⃣ Set HTTP-only cookie
        res.cookie("gbr_user", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // 7️⃣ Respond success
        res.status(201).json({
            success: true,
            message: "User registered successfully",
            newUser,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default registrationRouter;
