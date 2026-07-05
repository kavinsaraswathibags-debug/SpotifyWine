const admin = require('firebase-admin');

let bucket = null;
let firestore = null;
let configured = false;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

if (projectId && clientEmail && privateKey && storageBucket) {
  try {
    // Standardize newline formatting for private key
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: formattedPrivateKey,
      }),
      storageBucket: storageBucket
    });
    
    bucket = admin.storage().bucket();
    firestore = admin.firestore();
    configured = true;
    console.log("Firebase Admin SDK successfully initialized for Storage and Firestore!");
    
    // Configure CORS programmatically so client direct PUT uploads are permitted
    bucket.setCorsConfiguration([
      {
        origin: ['*'],
        method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
        maxAgeSeconds: 3600
      }
    ]).then(() => {
      console.log("Firebase Storage CORS configuration successfully updated!");
    }).catch(corsErr => {
      console.error("Warning: Failed to set Firebase Storage CORS configuration programmatically:", corsErr.message);
    });
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
  }
} else {
  console.log("Firebase environment variables are not fully configured. Falling back to local database/storage.");
}

function isFirebaseConfigured() {
  return configured;
}

function getFirestore() {
  if (!configured || !firestore) {
    throw new Error("Firebase Firestore is not configured or initialized");
  }
  return firestore;
}

/**
 * Uploads a buffer to Firebase Storage and returns its public URL.
 * @param {Buffer} buffer - File buffer.
 * @param {string} destPath - Destination path in the bucket.
 * @param {string} mimeType - The MIME type of the file.
 * @returns {Promise<string>} Public URL of the uploaded file.
 */
async function uploadToFirebase(buffer, destPath, mimeType) {
  if (!configured || !bucket) {
    throw new Error("Firebase is not configured");
  }

  const file = bucket.file(destPath);
  
  // Save file buffer
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
    resumable: false,
  });

  // Make the file public so it's readable from anywhere
  await file.makePublic();

  // Return the public HTTP URL
  // Format: https://storage.googleapis.com/[BUCKET_NAME]/[FILE_PATH]
  return `https://storage.googleapis.com/${bucket.name}/${destPath}`;
}

/**
 * Deletes a file from Firebase Storage given its public URL.
 * @param {string} fileUrl - The public URL of the file.
 */
async function deleteFromFirebase(fileUrl) {
  if (!configured || !bucket) return;
  
  try {
    const prefix = `https://storage.googleapis.com/${bucket.name}/`;
    if (fileUrl.startsWith(prefix)) {
      const destPath = decodeURIComponent(fileUrl.substring(prefix.length));
      const file = bucket.file(destPath);
      await file.delete();
      console.log(`Successfully deleted file from Firebase Storage: ${destPath}`);
    }
  } catch (error) {
    console.error("Failed to delete file from Firebase Storage:", error);
  }
}

/**
 * Generates a v4 presigned write URL for client-side direct upload.
 * @param {string} destPath - Destination path in the bucket.
 * @param {string} mimeType - The MIME type of the file.
 * @returns {Promise<{uploadUrl: string, publicUrl: string}>} Presigned write URL and final public URL.
 */
async function getPresignedUploadUrl(destPath, mimeType) {
  if (!configured || !bucket) {
    throw new Error("Firebase is not configured");
  }

  const file = bucket.file(destPath);
  
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes validity
    contentType: mimeType
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
  return { uploadUrl: url, publicUrl };
}

module.exports = {
  isFirebaseConfigured,
  getFirestore,
  uploadToFirebase,
  deleteFromFirebase,
  getPresignedUploadUrl
};
