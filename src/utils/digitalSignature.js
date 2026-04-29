import crypto from 'crypto';

/**
 * Tạo cặp khóa RSA 2048-bit cho tổ chức
 * @returns {{ publicKey: string, privateKey: string }} PEM format
 */
export const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  return { publicKey, privateKey };
};

/**
 * Ký văn bản bằng Private Key của người gửi
 * @param {string} content - Nội dung cần ký (title + content + documentNumber)
 * @param {string} privateKeyPem - Private key PEM của tổ chức gửi
 * @returns {string} Chữ ký dạng base64
 */
export const signDocument = (content, privateKeyPem) => {
  const sign = crypto.createSign('SHA256');
  sign.update(content);
  sign.end();
  const signature = sign.sign(privateKeyPem, 'base64');
  return signature;
};

/**
 * Xác minh chữ ký của văn bản bằng Public Key của người gửi
 * @param {string} content - Nội dung gốc của văn bản
 * @param {string} signature - Chữ ký base64 cần xác minh
 * @param {string} publicKeyPem - Public key PEM của tổ chức đã ký
 * @returns {boolean} true nếu hợp lệ, false nếu bị giả mạo
 */
export const verifyDocument = (content, signature, publicKeyPem) => {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(content);
    verify.end();
    return verify.verify(publicKeyPem, signature, 'base64');
  } catch (err) {
    return false;
  }
};

/**
 * Tạo nội dung chuẩn để ký từ các trường của văn bản
 * (Phải nhất quán giữa lúc ký và lúc xác minh)
 * @param {object} doc - Document object
 * @returns {string}
 */
export const buildSignableContent = (doc) => {
  return [
    doc.documentNumber || '',
    doc.title || '',
    doc.content || '',
  ].join('|');
};
