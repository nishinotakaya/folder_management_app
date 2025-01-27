// src/db.ts
import Dexie, { Table } from 'dexie';

export interface MyFile {
  id: string;
  name: string;
  type: 'excel' | 'powerpoint' | 'word' | 'pdf';
  lastModified: Date;
  data: string;             // Base64エンコードされたファイルデータ
  deleted: number;  // booleanからnumberに変更
  originalFolderId: string | null;
  deletedAt?: Date;
  isHidden: boolean;
  metadata?: {
    invoiceData?: {
      totalAmount?: number;
      invoiceNumber?: string;
      date?: string;
      dueDate?: string;    // 支払い期限を追加
    };
  };
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
