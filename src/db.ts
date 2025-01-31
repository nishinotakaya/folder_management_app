// src/db.ts
import Dexie, { Table } from 'dexie';

export interface MyFile {
  id: string; // ID
  name: string; // 名前
  type: 'excel' | 'powerpoint' | 'word' | 'pdf'; // 種類
  lastModified: Date; // 最終更新日
  data: string; // Base64エンコードされたファイルデータ
  deleted: number; // 削除フラグ
  originalFolderId: string | null; // 元のフォルダID
  deletedAt?: Date; // 削除日時
  isHidden: boolean; // 非表示フラグ
  isExternal?: boolean; // 外部フラグ
  metadata?: { // メタデータ
    invoiceData?: { // 請求書データ
      totalAmount?: number; // 合計金額
      invoiceNumber?: string; // 請求書番号
      date?: string; // 日付
      dueDate?: string; // 支払い期限
      client?: string; // クライアント
      subject?: string; // 件名
      bankDetails?: string; // 銀行情報
      registrationNumber?: string; // 的確請求書発行事業者登録番号
      notes?: string; // 備考
      companyName?: string; // 会社名
      seal?: string; // 印鑑
      unit?: string; // 単位
    };
  };
  folderId?: string; // フォルダID
  content?: Blob; // コンテンツ
  createdAt?: Date; // 作成日
}

export interface Folder {
  id: string;
  name: string;
  isTrash?: boolean;
}

class MyDatabase extends Dexie {
  folders!: Table<Folder, string>;
  files!: Table<MyFile, string>;

  constructor() {
    super("FolderManagementDB");
    this.version(1).stores({
      folders: 'id,name,isTrash',
      files: 'id,name,type,lastModified,deleted,originalFolderId,deletedAt,isHidden'
    });
  }
}

export const db = new MyDatabase();
