import mongoose from 'mongoose';

const documentSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
    },
    documentNumber: {
      type: String,
    },
    type: {
      type: String,
      enum: ['OFFICIAL', 'INTERNAL', 'EXPRESS', 'LEADER_SUBMIT', 'DRAFT_PUBLISH'],
      default: 'OFFICIAL',
    },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'PENDING_DISPATCHER', 'SENT', 'RECEIVED', 'FORWARDED', 'REJECTED', 'PROCESSED', 'PENDING_PUBLISH'],
      default: 'DRAFT',
    },
    attachments: [
      {
        name: String,
        path: String,
        mimetype: String,
        size: Number,
      },
    ],
    sender: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
      department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    },
    receiver: {
      organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
      department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
      // For LEADER_SUBMIT type: the intended leader recipient after dispatcher routing
      targetLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      // For INTERNAL/OFFICIAL: a specific employee target (optional, null = whole dept)
      targetEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // Chữ ký số RSA
    signature: { type: String, default: null },         // Chữ ký RSA dạng base64
    signerPublicKey: { type: String, default: null },   // Public key của tổ chức đã ký
    isSigned: { type: Boolean, default: false },        // Đã được ký chưa
    isVerified: { type: Boolean, default: false },      // Đã được xác minh chưa

    history: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: String,
        note: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model('Document', documentSchema);

export default Document;
