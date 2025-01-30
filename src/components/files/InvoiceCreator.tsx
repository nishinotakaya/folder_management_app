import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MyFile as DBMyFile } from '../../db';
import '@fontsource/noto-sans-jp';
import './InvoiceCreator.css'; // CSS適用

interface InvoiceCreatorProps {
  selectedFolderId: string | undefined;
  closeModal: () => void;
  addNewFile: (newFile: DBMyFile) => void;
}

interface Item {
  id: number;
  productNumber: number;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  totalAmount: number;
  client: string;
  subject: string;
  bankDetails: string;
}

const InvoiceCreator: React.FC<InvoiceCreatorProps> = ({ selectedFolderId, closeModal, addNewFile }) => {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    invoiceNumber: '',
    date: '',
    dueDate: '',
    totalAmount: 0,
    client: '',
    subject: '',
    bankDetails: '',
  });

  const [items, setItems] = useState<Item[]>([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setInvoiceData({ ...invoiceData, [name]: value });
  };

  const handleItemChange = (id: number, field: keyof Item, value: string | number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => {
    const newProductNumber = items.length + 1;
    setItems([...items, { id: Date.now(), productNumber: newProductNumber, productName: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  useEffect(() => {
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    setInvoiceData(prevData => ({ ...prevData, totalAmount: total }));
  }, [items]);

  const createPDF = async () => {
    if (!selectedFolderId) {
      alert('フォルダが選択されていません。');
      return;
    }

    const doc = new jsPDF();

    // フォントの埋め込み
    const fontUrl = '/src/assets/fonts/NotoSansJP-Regular.ttf'; // フォントファイルのパス
    const response = await fetch(fontUrl);
    const fontBlob = await response.blob();
    const reader = new FileReader();

    reader.readAsDataURL(fontBlob);
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const base64 = base64data.split(',')[1];

      doc.addFileToVFS('NotoSansJP-Regular.ttf', base64);
      doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
      doc.setFont('NotoSansJP'); // フォントを適用
      doc.setFontSize(12);

      // 作成日
      const currentDate = new Date().toLocaleDateString();
      doc.text(`作成日: ${currentDate}`, 150, 10);

      // 会社名 & 案件名
      doc.setFontSize(14);
      doc.text(`請求書`, 90, 20);
      doc.setFontSize(12);
      doc.text(`会社名: ${invoiceData.client}`, 10, 30);
      doc.text(`案件名: ${invoiceData.subject}`, 10, 40);

      // 請求情報
      doc.text(`請求書番号: ${invoiceData.invoiceNumber}`, 10, 50);
      doc.text(`請求日: ${invoiceData.date}`, 10, 60);
      doc.text(`支払期日: ${invoiceData.dueDate}`, 10, 70);

      // 振込先情報
      doc.text(`振込先`, 10, 80);
      doc.text(invoiceData.bankDetails, 10, 90);

      // テーブルヘッダー
      autoTable(doc, {
        startY: 100,
        head: [['品名', '数量', '単価', '小計']],
        body: items.map(item => [
          item.productName || '',
          item.quantity || 0,
          item.unitPrice || 0,
          (item.quantity || 0) * (item.unitPrice || 0),
        ]),
        styles: { font: 'NotoSansJP' } // 日本語フォントを適用
      });

      // 合計金額
      const finalY = (doc as any).lastAutoTable.finalY;
      doc.text(`ご請求金額（税込）: ¥${invoiceData.totalAmount.toLocaleString()}`, 10, finalY + 10);

      // PDFをBlobとして取得
      const pdfBlob = doc.output('blob');
      const pdfFileName = `Invoice_${invoiceData.invoiceNumber}.pdf`;

      // IndexedDB に保存
      const newFile: DBMyFile = {
        id: Date.now().toString(),
        name: pdfFileName,
        folderId: selectedFolderId,
        content: pdfBlob,
        lastModified: new Date(),
        type: 'pdf',
        data: '',
        deleted: 0,
        originalFolderId: null,
        isHidden: false,
        createdAt: new Date(),
        metadata: {
          invoiceData: {
            invoiceNumber: invoiceData.invoiceNumber,
            totalAmount: invoiceData.totalAmount,
            client: invoiceData.client,
            subject: invoiceData.subject,
            date: invoiceData.date,
            dueDate: invoiceData.dueDate,
            bankDetails: invoiceData.bankDetails,
          }
        }
      };
      addNewFile(newFile);

      // PDFをダウンロード
      doc.save(pdfFileName);

      // モーダルを閉じる
      closeModal();
    };
  };



  // 新しい関数を追加
  const saveToOpenFile = (pdfBlob: Blob, pdfFileName: string) => {
    // ここで開いているファイルにPDFデータを保存する処理を実装
    // 例: ローカルストレージやIndexedDBに保存するなど
    console.log(`Saving ${pdfFileName} to open file...`);
  };

  return (
    <div className="invoice-container">
      <h2 className="invoice-title">請求書作成</h2>
      <div className="invoice-form">
        <label>
          請求書番号:
          <input type="text" name="invoiceNumber" value={invoiceData.invoiceNumber} onChange={handleInputChange} />
        </label>
        <label>
          取引先:
          <input type="text" name="client" value={invoiceData.client} onChange={handleInputChange} />
        </label>
        <label>
          件名:
          <input type="text" name="subject" value={invoiceData.subject} onChange={handleInputChange} />
        </label>
        <label>
          請求日:
          <input type="date" name="date" value={invoiceData.date} onChange={handleInputChange} />
        </label>
        <label>
          支払期日:
          <input type="date" name="dueDate" value={invoiceData.dueDate} onChange={handleInputChange} />
        </label>
        <label>
          お振込先:
          <textarea name="bankDetails" value={invoiceData.bankDetails} onChange={handleInputChange} />
        </label>
      </div>

      <h3>品目</h3>
      <div className="invoice-items">
        <table>
          <thead>
            <tr>
              <th>品名</th>
              <th>数量</th>
              <th>単価</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="invoice-item">
                <td>
                  <input
                    type="text"
                    placeholder="品名"
                    value={item.productName}
                    onChange={e => handleItemChange(item.id, 'productName', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    placeholder="数量"
                    value={item.quantity}
                    onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    placeholder="単価"
                    value={item.unitPrice}
                    onChange={e => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td>
                  <button className="icon-btn delete-btn" onClick={() => removeItem(item.id)}>−</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="button-group">
          <button className="icon-btn add-btn" onClick={addItem}>＋</button>
        </div>
      </div>

      <h3 className="total-amount">合計金額: ¥{invoiceData.totalAmount}</h3>
      <button className="save-btn" onClick={createPDF} disabled={!selectedFolderId}>PDFとして保存</button>
    </div>
  );
};

export default InvoiceCreator;
