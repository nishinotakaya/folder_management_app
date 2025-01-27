import React from 'react';
import { MyFile } from '../../db';

interface FileItemProps {
  file: MyFile;
  importToGoogleDrive: (file: MyFile) => void;
  handleDownload: (fileData: string, fileName: string) => void;
  restoreFile: (fileId: string) => void;
  permanentlyDeleteFile: (fileId: string) => void;
  editFileName: (folderId: string, fileId: string) => void;
  moveToTrash: (folderId: string, fileId: string) => void;
  isTrash: boolean;
}

const FileItem: React.FC<FileItemProps> = ({
  file,
  importToGoogleDrive,
  handleDownload,
  restoreFile,
  permanentlyDeleteFile,
  editFileName,
  moveToTrash,
  isTrash
}) => {
  return (
    <div className={`file-item ${file.isHidden ? 'hidden' : ''}`}>
      <div className="file-info">
        {file.type === 'excel' && '📊'}
        {file.type === 'powerpoint' && '📑'}
        {file.type === 'word' && '📝'}
        {file.type === 'pdf' && '📕'}
        <span
          className="file-name"
          onClick={() => handleDownload(file.data, file.name)}
          style={{ cursor: 'pointer' }}
        >
          {file.name}
        </span>
        <span className="file-date">
          {isTrash
            ? `削除日: ${file.deletedAt ? new Date(file.deletedAt).toLocaleDateString() : ''}`
            : new Date(file.lastModified).toLocaleDateString()
          }
        </span>
      </div>
      <div className="file-actions">
        {isTrash ? (
          <>
            <button onClick={() => restoreFile(file.id)} title="ファイルを復元">♻️</button>
            <button onClick={() => permanentlyDeleteFile(file.id)} title="完全に削除">🗑️</button>
          </>
        ) : (
          <>
            <button onClick={() => editFileName(file.originalFolderId || '', file.id)} title="ファイル名を編集">✏️</button>
            <button onClick={() => moveToTrash(file.originalFolderId || '', file.id)} title="ゴミ箱に移動">🗑️</button>
            {(file.type === 'excel' || file.type === 'powerpoint') && (
              <button onClick={() => importToGoogleDrive(file)} title="Google Driveにインポート">⇪ Import</button>
            )}
          </>
        )}
      </div>
      {file.type === 'pdf' && file.metadata?.invoiceData && (
        <div className="invoice-info">
          <span>合計金額: ¥{file.metadata.invoiceData.totalAmount?.toLocaleString()}</span>
          {file.metadata.invoiceData.dueDate && (
            <span>支払い期限: {file.metadata.invoiceData.dueDate}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default FileItem;