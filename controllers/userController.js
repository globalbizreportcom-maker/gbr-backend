// backend/controllers/userController.js

import mongoose from "mongoose";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const checkOrCreateUser = async (req, res) => {
    try {
        const { name, email, country, phone, company, gst } = req.body;
        if (!email || !name) {
            return res.status(400).json({ error: "Name and Email are required" });
        }

        let user = await User.findOne({ email });

        if (user) {
            return res.status(200).json({ exists: true, message: "User already exists, kindly login", user });
        }

        // create new user
        user = await User.create({
            name,
            email,
            country: country,
            phone: phone || "",
            company: company || "",
            gstin: gst
        });

        // 🔑 Create JWT token
        const token = jwt.sign(
            { email: user.email, id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "30d" } // adjust as needed
        );

        // 🔒 Set HTTP-only cookie
        res.cookie("gbr_user", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        return res.status(201).json({ exists: false, message: "New user created", user });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
};

export const addPassword = async (req, res) => {
    try {
        const { userId, password } = req.body;

        if (!userId || !password) {
            return res.status(400).json({ message: "User ID and password are required" });
        }

        // Fetch user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // If user already has password
        if (user.password) {
            return res.status(400).json({ message: "Password already set. Use change password instead." });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save password
        user.password = hashedPassword;
        await user.save();

        // Send back user object with passwordSet: true
        const userData = user.toObject();
        delete userData.password;
        userData.password = true;

        return res.status(200).json({ message: "Password added successfully", user: userData });
    } catch (err) {
        console.error("Add password error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Fetch user with password included
        const user = await User.findById(userId).select("+password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if currentPassword matches
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        // Prepare user object without password
        const userData = user.toObject();
        delete userData.password;
        userData.password = true;

        return res.status(200).json({ message: "Password changed successfully", user: userData });
    } catch (err) {
        console.error("Change password error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { userId, ...updateFields } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        // Validate update fields
        const allowedFields = ["name", "company", "country", "phone", "gstin"];
        const updates = {};
        for (const key of Object.keys(updateFields)) {
            if (allowedFields.includes(key)) {
                updates[key] = updateFields[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        // Update user in DB
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true } // return updated doc
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json({
            message: "Profile updated successfully",
            user: updatedUser,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
};

