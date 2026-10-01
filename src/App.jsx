import { useState } from "react";

const UPLOAD_URL = "/api/files/upload";

function App() {
  const [fileId, setFileId] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploadedId, setUploadedId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    setStatus("");
    setError("");
    setUploadedId("");

    if (!fileId.trim() || !file) {
      setError("Please enter a File ID and choose a file.");
      return;
    }

    const formData = new FormData();
    formData.append("fileId", fileId.trim());
    formData.append("file", file);

    setLoading(true);
    try {
      // Don't set Content-Type manually; the browser adds the multipart boundary.
      const response = await fetch(UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Upload failed (status ${response.status})`);
      }

      setStatus(text || "Upload successful");
      setUploadedId(fileId.trim());
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>File Upload</h1>

      <form onSubmit={handleUpload}>
        <label>
          File ID
          <input
            type="text"
            value={fileId}
            onChange={(e) => setFileId(e.target.value)}
            placeholder="Enter a File ID"
          />
        </label>

        <label>
          Choose File
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>

      <div className="info">
        <p>
          <strong>Entered File ID:</strong> {fileId || "-"}
        </p>
        <p>
          <strong>Selected File:</strong>{" "}
          {file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : "-"}
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {status && (
        <div className="success">
          <p>
            <strong>Status:</strong> {status}
          </p>
          <p>
            <strong>File ID:</strong> {uploadedId}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
