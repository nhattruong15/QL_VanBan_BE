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
    category: {
      type: String,
      default: 'Công văn' // Loại văn bản hiển thị trên giao diện kinh doanh
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
      targetLeader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      targetEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    issuingOrganizations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    // người ký văn bản (lãnh đạo trong công ty)
    signer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Chữ ký số RSA
    signature: { type: String, default: null },         // Chữ ký RSA dạng base64
    signerPublicKey: { type: String, default: null },   // Public key của tổ chức đã ký
    isSigned: { type: Boolean, default: false },        // Đã được ký chưa
    isVerified: { type: Boolean, default: false },      // Đã được xác minh chưa
    isPublishedCopy: { type: Boolean, default: false },  // Bản sao được tạo khi ban hành DRAFT_PUBLISH

    history: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        action: String,
        note: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    
    feedbacks: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        summary: String,
        content: String,
        category: { type: String, default: 'Công văn' },
        attachments: [
          {
            name: String,
            path: String,
            mimetype: String,
            size: Number,
          }
        ],
        createdAt: { type: Date, default: Date.now },
      }
    ],
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model('Document', documentSchema);

export default Document;
