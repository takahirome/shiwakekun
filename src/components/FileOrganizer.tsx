import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

function FileOrganizer() {
  const [sourceFile, setSourceFile] = useState("");
  const [destFolder, setDestFolder] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleMoveFile = async () => {
    if (!sourceFile || !destFolder) {
      setMessage("ソースファイルと保存先フォルダを指定してください");
      return;
    }

    try {
      setIsLoading(true);
      setMessage("ファイルを移動中...");

      // ファイル名のみを取得
      const fileName = sourceFile.split("/").pop();
      const destPath = `${destFolder}/${fileName}`;

      // Rustのコマンドを呼び出す
      await invoke("move_file", {
        sourcePath: sourceFile,
        destPath: destPath,
      });

      setMessage(`ファイルを正常に移動しました: ${destPath}`);
    } catch (error) {
      console.error("ファイル移動エラー:", error);
      setMessage(`エラー: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="file-organizer">
      <h2>ファイル整理</h2>

      <div className="form-group">
        <label>ソースファイル:</label>
        <input
          type="text"
          value={sourceFile}
          onChange={(e) => setSourceFile(e.target.value)}
          placeholder="/path/to/source/file.jpg"
        />
      </div>

      <div className="form-group">
        <label>保存先フォルダ:</label>
        <input
          type="text"
          value={destFolder}
          onChange={(e) => setDestFolder(e.target.value)}
          placeholder="/path/to/destination/folder"
        />
      </div>

      <button onClick={handleMoveFile} disabled={isLoading}>
        {isLoading ? "処理中..." : "ファイルを移動"}
      </button>

      {message && <div className="message">{message}</div>}
    </div>
  );
}

export default FileOrganizer;
