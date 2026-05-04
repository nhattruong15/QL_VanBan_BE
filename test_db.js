import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const Document = (await import('./src/models/documentModel.js')).default;
    
    // Find latest document published by the dispatcher
    const docs = await Document.find({}).sort({createdAt: -1}).limit(5).lean();
    
    console.log(JSON.stringify(docs.map(d => ({
        id: d._id,
        title: d.title,
        type: d.type,
        status: d.status,
        issuingOrganizations: d.issuingOrganizations,
        receiver: d.receiver,
        history: d.history.slice(-1)
    })), null, 2));
    
    process.exit(0);
}).catch(console.error);
