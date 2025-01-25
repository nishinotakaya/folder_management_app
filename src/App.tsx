// src/App.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import React from 'react';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { useGoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import axios from 'axios';
import { db, Folder, MyFile } from './db';

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
    </div>
  );
};

function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [files, setFiles] = useState<MyFile[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem('googleAccessToken')
  );
  const [userEmail, setUserEmail] = useState<string | null>(() =>
    localStorage.getItem('userEmail')
  );

  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('googleAccessToken', accessToken);
    } else {
      localStorage.removeItem('googleAccessToken');
    }
  }, [accessToken]);

  const login = useGoogleLogin({
    onSuccess: async (response) => {
      console.log('ログイン成功:', response);
      setAccessToken(response.access_token);

      // ユーザー情報を取得
      try {
        const userInfoResponse = await axios.get(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: {
              Authorization: `Bearer ${response.access_token}`
            }
          }
        );
        setUserEmail(userInfoResponse.data.email);
        localStorage.setItem('userEmail', userInfoResponse.data.email);
      } catch (error) {
        console.error('ユーザー情報の取得に失敗:', error);
      }

      const expirationTime = new Date().getTime() + (response.expires_in * 1000);
      localStorage.setItem('tokenExpirationTime', expirationTime.toString());
    },
    onError: (error) => {
      console.error('ログインエラー:', error);
      alert('ログインに失敗しました。');
    },
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.metadata email profile openid',
    flow: 'implicit',
    prompt: 'select_account'
  });

  useEffect(() => {
    const checkTokenExpiration = () => {
      const expirationTime = localStorage.getItem('tokenExpirationTime');
      if (expirationTime) {
        const currentTime = new Date().getTime();
        if (currentTime > parseInt(expirationTime)) {
          setAccessToken(null);
          localStorage.removeItem('googleAccessToken');
          localStorage.removeItem('tokenExpirationTime');
          alert('セッションの有効期限が切れました。再度ログインしてください。');
        }
      }
    };

    const interval = setInterval(checkTokenExpiration, 60000);
    return () => clearInterval(interval);
  }, []);

  const logout = () => {
    setAccessToken(null);
    setUserEmail(null);
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('tokenExpirationTime');
    localStorage.removeItem('userEmail');
  };

  const switchAccount = () => {
    logout();
    login();
  };

  // Dexie DBの初期化
  useEffect(() => {
    const initDB = async () => {
      try {
        await db.open();
      } catch (error) {
        console.error('DB初期化エラー:', error);
      }
    };
    initDB();
  }, []);

  // フォルダーとファイルの初期化
  useEffect(() => {
    const initializeData = async () => {
      const storedFolders = await db.folders.toArray();
      if (storedFolders.length === 0) {
        // ゴミ箱フォルダを作成
        const trashFolder: Folder = {
          id: 'trash',
          name: 'ゴミ箱',
          isTrash: true
        };
        await db.folders.add(trashFolder);
        setFolders([trashFolder]);
      } else {
        setFolders(storedFolders);
      }

      const storedFiles = await db.files.toArray();
      setFiles(storedFiles);
    };
    initializeData();
  }, []);

  // フォルダー選択時にファイルを取得
  useEffect(() => {
    if (selectedFolder) {
      const fetchFiles = async () => {
        if (selectedFolder.isTrash) {
          const trashFiles = await db.files.where('deleted').equals(1).toArray();
          setFiles(trashFiles);
        } else {
          const folderFiles = await db.files
            .where('originalFolderId')
            .equals(selectedFolder.id)
            .and(file => file.deleted === 0)  // 削除されていないファイルのみを取得
            .toArray();
          setFiles(folderFiles);
        }
      };
      fetchFiles();
    }
  }, [selectedFolder]);

  const addFolder = async () => {
    const folderName = prompt('フォルダー名を入力してください');
    if (folderName) {
      const newFolder: Folder = {
        id: Date.now().toString(),
        name: folderName
      };
      await db.folders.add(newFolder);
      setFolders([...folders, newFolder]);
    }
  };

  // 受け入れるファイル拡張子と対応するカスタムtypeを設定
  const allowedTypes: Record<string, MyFile['type']> = {
    'application/vnd.ms-excel': 'excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
    'application/vnd.ms-powerpoint': 'powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
    'application/msword': 'word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
    'application/pdf': 'pdf',  // PDFを追加
  };

  const onDrop = useCallback(async (acceptedFiles: File[], folderId: string) => {
    for (const file of acceptedFiles) {
      const isAllowed = allowedTypes[file.type];
      if (!isAllowed) {
        alert(
          `${file.name}は対応していないファイル形式です。\n` +
          `Excel、PowerPoint、Word、PDFファイルのみ対応しています。`
        );
        continue;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const processedFile: MyFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          type: allowedTypes[file.type],
          lastModified: new Date(file.lastModified),
          data: base64Data,
          deleted: 0, // boolean に設定
          originalFolderId: folderId,
          isHidden: false
        };

        // IndexedDBにファイルを追加
        await db.files.add(processedFile);
        setFiles(prevFiles => [...prevFiles, processedFile]);

        // フォルダーリストを更新
        setFolders(await db.folders.toArray());
      };
      reader.readAsDataURL(file);
    }
  }, [allowedTypes, setFolders, setFiles]);

  // react-dropzoneの設定
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      if (selectedFolder) {
        onDrop(acceptedFiles, selectedFolder.id);
      }
    },
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/pdf': ['.pdf']
    },
    noClick: true,
    noKeyboard: true,
    multiple: true,
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
    }
  }) as {
    getRootProps: () => React.HTMLAttributes<HTMLDivElement>;
    getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>;
    isDragActive: boolean;
  };

  // ファイルのダウンロード処理
  const handleDownload = (fileData: string, fileName: string) => {
    try {
      // Base64データからBlobを作成
      const byteString = atob(fileData.split(',')[1]);
      const mimeString = fileData.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);

      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }

      const blob = new Blob([ab], { type: mimeString });
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Download failed:', error);
      alert('ダウンロードに失敗しました。');
    }
  };

  const editFolderName = async (folderId: string) => {
    const folder = await db.folders.get(folderId);
    if (!folder) return;

    const newName = prompt('新しいフォルダー名を入力してください', folder.name);
    if (newName) {
      await db.folders.update(folderId, { name: newName });
      setFolders(await db.folders.toArray());
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (window.confirm('このフォルダーを削除してもよろしいですか？')) {
      // フォルダー内のファイルも削除
      const folderFiles = await db.files.where('originalFolderId').equals(folderId).toArray();
      for (const file of folderFiles) {
        await db.files.delete(file.id);
      }

      await db.folders.delete(folderId);
      setFolders(await db.folders.toArray());
      setFiles([]);
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null);
      }
    }
  };

  const editFileName = async (folderId: string, fileId: string) => {
    const file = await db.files.get(fileId);
    if (!file) return;

    const newName = prompt('新しいファイル名を入力してください', file.name);
    if (newName) {
      await db.files.update(fileId, { name: newName });
      setFiles(await db.files.toArray());
    }
  };

  const moveToTrash = async (folderId: string, fileId: string) => {
    if (window.confirm('このファイルをゴミ箱に移動してもよろしいですか？')) {
      const file = await db.files.get(fileId);
      if (!file) return;

      // ファイルをゴミ箱に移動
      await db.files.update(fileId, {
        deleted: 1,
        deletedAt: new Date(),
        isHidden: true
      });

      // 現在のフォルダーの表示を即座に更新
      setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
    }
  };

  const permanentlyDeleteFile = async (fileId: string) => {
    if (window.confirm('このファイルを完全に削除してもよろしいですか？\nこの操作は取り消せません。')) {
      await db.files.delete(fileId);
      setFiles(await db.files.toArray());
    }
  };

  const restoreFile = async (fileId: string) => {
    const file = await db.files.get(fileId);
    if (!file || !file.originalFolderId) return;

    // ファイルを元のフォルダーに復元
    await db.files.update(fileId, {
      deleted: 0,
      isHidden: false,
      deletedAt: undefined
    });

    setFiles(await db.files.toArray());
  };

  // Google Driveにインポートする機能
  const importToGoogleDrive = async (file: MyFile) => {
    if (!accessToken) {
      alert('Google APIのアクセストークンが設定されていません。ログインしてください。');
      return;
    }

    try {
      // Base64 -> Blob
      const byteString = atob(file.data.split(',')[1]);
      const mimeString = file.data.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });

      // Google Driveにアップロードする際のMIMEタイプ（変換先のGoogle形式）
      // Excel -> Google スプレッドシート
      // PowerPoint -> Google スライド
      const convertMimeType =
        file.type === 'excel'
          ? 'application/vnd.google-apps.spreadsheet'
          : 'application/vnd.google-apps.presentation';

      // multipart/related 形式でリクエストを作成
      const metadata = {
        name: file.name,
        mimeType: convertMimeType
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const requestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeString}\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        file.data.split(',')[1] +
        closeDelimiter;

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: requestBody
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive upload failed: ${errorText}`);
      }

      alert(`Google Driveへのインポートが完了しました（${file.name} → ${file.type === 'excel' ? 'Sheets' : 'Slides'}）。`);
    } catch (err) {
      console.error(err);
      alert('Google Driveへのインポートに失敗しました。');
    }
  };

  // フォルダーをソートする関数（ゴミ箱を最後に）
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      if (a.isTrash) return 1;  // ゴミ箱は後ろへ
      if (b.isTrash) return -1; // ゴミ箱は後ろへ
      return a.name.localeCompare(b.name); // その他のフォルダーは名前順
    });
  }, [folders]);

  return (
    <div className="App">
      <h1>フォルダー管理システム</h1>
      <div className="auth-section">
        {accessToken ? (
          <div>
            <p>ログイン中: {userEmail}</p>
            <button onClick={logout}>ログアウト</button>
            <button onClick={switchAccount}>アカウント切り替え</button>
          </div>
        ) : (
          <button onClick={() => login()}>Googleでログイン</button>
        )}
      </div>
      <div className="folder-container">
        <div className="folder-list">
          <button onClick={addFolder}>新規フォルダー作成</button>
          {sortedFolders.map(folder => (
            <div key={folder.id} className="folder-item">
              <div className="folder-name" onClick={() => setSelectedFolder(folder)}>
                {folder.isTrash ? '🗑️' : '📁'} {folder.name}
              </div>
              {!folder.isTrash && (
                <div className="folder-actions">
                  <button onClick={() => editFolderName(folder.id)} title="フォルダー名を編集">✏️</button>
                  <button onClick={() => deleteFolder(folder.id)} title="フォルダーを削除">🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedFolder && (
          <div
            className={`file-list ${isDragActive ? 'dragging' : ''}`}
            {...getRootProps()}
          >
            <input {...getInputProps()} />
            <h2>{selectedFolder.name}の中身</h2>
            {!selectedFolder.isTrash && (
              <p className="drop-zone">
                {isDragActive
                  ? 'ファイルをここにドロップしてください'
                  : 'ここにファイルをドラッグ＆ドロップしてください（Excel, PowerPoint, Word, PDF）'
                }
              </p>
            )}
            {selectedFolder.isTrash ? (
              <>
                {files.map(file => (
                  <FileItem
                    key={file.id}
                    file={file}
                    importToGoogleDrive={importToGoogleDrive}
                    handleDownload={handleDownload}
                    restoreFile={restoreFile}
                    permanentlyDeleteFile={permanentlyDeleteFile}
                    editFileName={editFileName}
                    moveToTrash={moveToTrash}
                    isTrash={true}
                  />
                ))}
              </>
            ) : (
              <>
                {files.map(file => (
                  <FileItem
                    key={file.id}
                    file={file}
                    importToGoogleDrive={importToGoogleDrive}
                    handleDownload={handleDownload}
                    restoreFile={restoreFile}
                    permanentlyDeleteFile={permanentlyDeleteFile}
                    editFileName={editFileName}
                    moveToTrash={moveToTrash}
                    isTrash={false}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// AppをGoogleOAuthProviderでラップしたコンポーネントをエクスポート
const AppWithAuth = () => {
  const CLIENT_ID = '1084259707763-8n73b61163lo7m5at6mcpgmn5svcmcs5.apps.googleusercontent.com';

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  );
};

export default AppWithAuth;
