import mongoose from 'mongoose';
import dns from 'dns/promises';
import User from '../models/User.js';
import paymentVisitors from "../models/paymentVisitor.js"
import ReportRequest from '../models/ReportRequest.js';
import Payment from '../models/Payment.js';

dns.setServers(['8.8.8.8']);


const connectDB = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        console.log('MONGO_URI is missing in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri, {
            dbName: "gbr_db",   // 👈 this overrides the default "test"
            // Timeout settings
            connectTimeoutMS: 10000, // 10 seconds
            // socketTimeoutMS: 45000,  // 45 seconds
            // DNS resolution (optional): forces IPv4
            family: 4,
        });

        // await User.deleteMany({
        //     email: {
        //         $in: [
        //             'offlguy@gmail.com',
        //             'pabishek61001@gmail.com',
        //             // 'rishirajappan2@gmail.com',
        //             // 'suryacbr@gmail.com',
        //             // 'surya49official@gmail.com',
        //             // 'venkat@samantacom.com',
        //         ]
        //     }
        // });

        // await paymentVisitors.deleteMany({
        //     contactEmail: { $in: ['offlguy@gmail.com', 'pabishek61001@gmail.com'] }
        // });

        // await ReportRequest.deleteMany({
        //     "requesterInfo.email": "pabishek61001@gmail.com"
        // });

        // // Array of IDs to delete
        // await Payment.deleteMany({
        //     'details.payerEmail': 'pabishek61001@gmail.com'
        // });


        console.log('Connected to MongoDB Atlas');
    } catch (error) {
        console.log('MongoDB connection error:', error.message);
        process.exit(1);
    }
};

export default connectDB;
