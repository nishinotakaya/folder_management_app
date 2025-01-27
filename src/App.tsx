// src/App.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { useGoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import axios from 'axios';
import { db, Folder, MyFile as DBMyFile } from './db';
import * as pdfjsLib from 'pdfjs-dist';
import OpenAI from 'openai';
import FileItem from './components/files/FileItem';


// PDFワーカーの設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface InvoiceData {
  totalAmount?: number;
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
}

interface CustomFile extends File {
  webkitGetAsEntry?: () => FileSystemEntry | null;
  dataTransfer?: DataTransfer;
}

function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [files, setFiles] = useState<DBMyFile[]>([]);
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
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.metadata email profile openid https://www.googleapis.com/auth/spreadsheets.readonly',
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
  const allowedTypes: Record<string, DBMyFile['type']> = {
    'application/vnd.ms-excel': 'excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
    'application/vnd.ms-powerpoint': 'powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
    'application/msword': 'word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
    'application/pdf': 'pdf',
    'text/csv': 'excel',  // CSVファイルを追加
  };

  // OpenAI APIの設定
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
  console.log('OpenAI APIキーの長さ:', OPENAI_API_KEY?.length);

  // 合計金額を計算する関数
  const calculateTotalAmount = async (pdfText: string): Promise<number> => {
    try {
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
        dangerouslyAllowBrowser: true,
        maxRetries: 2,
        timeout: 30000,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "請求書から合計金額のみを数値で抽出してください。カンマや円マークは除いて数値のみを返してください。例：「123456」"
          },
          { role: "user", content: pdfText }
        ],
        temperature: 0.3,
        max_tokens: 50  // 数値のみを返すので少なめに設定
      });

      const amount = completion.choices[0].message.content;
      // 数値以外の文字を除去して数値に変換
      const cleanAmount = amount?.replace(/[^0-9]/g, '');
      return cleanAmount ? parseInt(cleanAmount) : 0;

    } catch (error) {
      console.error('合計金額の計算エラー:', error);
      return 0;
    }
  };

  const processInvoicePDF = async (pdfData: string): Promise<InvoiceData> => {
    try {
      const pdfText = await extractTextFromPDF(pdfData);

      // 合計金額を計算
      const totalAmount = await calculateTotalAmount(pdfText);

      // 他の情報も含めて返す
      return {
        totalAmount,
        // ... その他の情報
      };

    } catch (error) {
      console.error('PDF解析エラー:', error);
      return {};
    }
  };

  const extractTextFromPDF = async (pdfData: string): Promise<string> => {
    try {
      const data = atob(pdfData.split(',')[1]);
      const array = new Uint8Array(data.length);

      for (let i = 0; i < data.length; i++) {
        array[i] = data.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: array }).promise;
      let text = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ');
      }

      return text;
    } catch (error) {
      console.error('PDFのテキスト抽出エラー:', error);
      throw new Error('PDFテキスト抽出に失敗しました');
    }
  };

  const onDrop = useCallback(async (acceptedFiles: CustomFile[], folderId: string) => {
    // FileSystemDirectoryEntry や FileSystemFileEntry を処理する関数
    const processEntry = async (entry: FileSystemEntry) => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        return new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const dirReader = dirEntry.createReader();
        return new Promise<File[]>((resolve, reject) => {
          const readEntries = () => {
            dirReader.readEntries(async (entries) => {
              if (entries.length === 0) {
                resolve([]);
              } else {
                const files = await Promise.all(entries.map(processEntry));
                const moreFiles = await new Promise<File[]>((res) => {
                  setTimeout(() => readEntries(), 0);
                  res([]);
                });
                resolve(files.flat().concat(moreFiles));
              }
            }, reject);
          };
          readEntries();
        });
      }
      return [];
    };

    // ファイルの処理（既存のコード）
    const processFile = async (file: File) => {
      const isAllowed = allowedTypes[file.type];
      if (!isAllowed) {
        console.warn(
          `${file.name}は対応していないファイル形式です。\n` +
          `Excel、PowerPoint、Word、PDFファイルのみ対応しています。`
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const processedFile: DBMyFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          type: allowedTypes[file.type],
          lastModified: new Date(file.lastModified),
          data: base64Data,
          deleted: 0,
          originalFolderId: folderId,
          isHidden: false
        };

        if (file.type === 'application/pdf') {
          const invoiceData = await processInvoicePDF(base64Data);
          processedFile.metadata = {
            invoiceData
          };
        }

        await db.files.add(processedFile);
        setFiles(prevFiles => [...prevFiles, processedFile]);
      };
      reader.readAsDataURL(file);
    };

    // ドロップされたアイテムの処理
    if (acceptedFiles[0]?.type === '') {
      // フォルダーがドロップされた場合
      const entry = acceptedFiles[0].webkitGetAsEntry?.();
      if (entry) {
        const files = await processEntry(entry);
        if (Array.isArray(files)) {
          for (const file of files) {
            await processFile(file);
          }
        } else if (files) {
          await processFile(files);
        }
      }
    } else {
      // 通常のファイルがドロップされた場合
      for (const file of acceptedFiles) {
        await processFile(file);
      }
    }
  }, [allowedTypes, setFiles]);

  // Dropzoneの設定を更新
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: CustomFile[]) => {
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
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv']  // CSVファイルを追加
    },
    noClick: true,
    noKeyboard: true,
    multiple: true,
    onDragEnter: (event) => event.preventDefault(),
    onDragOver: (event) => event.preventDefault(),
    onDragLeave: (event) => event.preventDefault(),
    useFsAccessApi: false
  });

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
  const importToGoogleDrive = async (file: DBMyFile) => {
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

  // ファイルを合計金額と名前でソートする関数
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      return a.name.localeCompare(b.name); // 名前でソート
    });
  }, [files]);

  // 選択されたフォルダ内のPDFファイルの合計金額を計算する関数
  const calculateTotalAmountFromPDF = useMemo(() => {
    if (!selectedFolder || selectedFolder.isTrash) return 0;

    return files.reduce((total, file) => {
      const amount = file.type === 'pdf' && file.metadata?.invoiceData?.totalAmount
        ? Number(file.metadata.invoiceData.totalAmount)
        : 0;

      // NaNをチェック
      return total + (isNaN(amount) ? 0 : amount);
    }, 0);
  }, [files, selectedFolder]);

  const fetchFilesFromGoogleDrive = async (accessToken: string) => {
    try {
      const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          q: "'root' in parents", // ルートフォルダのファイルを取得
          fields: 'files(id, name, mimeType)',
        },
      });

      const files = response.data.files;
      console.log('Google Driveから取得したファイル:', files);
      return files;
    } catch (error) {
      console.error('Google Driveからのファイル取得エラー:', error);
      return [];
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchFilesFromGoogleDrive(accessToken).then((files) => {
        // 取得したファイルをアプリケーションに取り込む処理
        console.log(files);
      });
    }
  }, [accessToken]);

  const importSpreadsheet = async () => {
    if (!accessToken) {
      alert('Googleにログインしてください。');
      return;
    }

    // Google Picker APIを使用してスプレッドシートを選択
    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(accessToken)
      .setDeveloperKey('YOUR_ACTUAL_DEVELOPER_KEY')
      .setCallback(async (data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
          const doc = data[window.google.picker.Response.DOCUMENTS][0];
          const id = doc[window.google.picker.Document.ID];
          console.log('選択されたスプレッドシートID:', id);

          // Google Sheets APIを使用してスプレッドシートデータを取得
          const response = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          console.log('スプレッドシートデータ:', response.data);
        }
      })
      .build();
    picker.setVisible(true);
  };

  return (
    <div className="App">
      <h1>請求書管理システム</h1>
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
                {sortedFiles.map(file => (
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
                {sortedFiles.map(file => (
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
            {/* フォルダ内のPDF合計金額を表示 */}
            {!selectedFolder.isTrash && files.some(file => file.type === 'pdf') && (
              <div className="total-amount">
                <h3>請求書合計: ¥{calculateTotalAmountFromPDF.toLocaleString()}</h3>
              </div>
            )}
          </div>
        )}
      </div>
      <button onClick={importSpreadsheet}>スプレッドシートをインポート</button>
    </div>
  )
}

// AppをGoogleOAuthProviderでラップしたコンポーネントをエクスポート
const AppWithAuth = () => {
  const VITE_CLIENT_ID = import.meta.env.VITE_CLIENT_ID; // 環境変数からCLIENT_IDを取得

  return (
    <GoogleOAuthProvider clientId={VITE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  );
};

export default AppWithAuth;
