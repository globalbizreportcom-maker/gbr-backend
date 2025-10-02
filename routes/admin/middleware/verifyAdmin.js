import jwt from "jsonwebtoken";

export const verifyAdmin = (req, res, next) => {
    const token = req.cookies.gbr_admin;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded; // {id, role}
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
