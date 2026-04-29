import mongoose from 'mongoose';

const organizationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
    },
    address: String,
    phone: String,
    email: String,
    // Chữ ký số RSA
    publicKey: { type: String, default: null },   // Public key PEM - chia sẻ công khai
    privateKey: { type: String, default: null },  // Private key PEM - bảo mật nội bộ
  },
  {
    timestamps: true,
  }
);

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
