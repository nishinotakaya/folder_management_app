import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MyFile as DBMyFile } from '../../db';
import '@fontsource/noto-sans-jp';
import './InvoiceCreator.css'; // CSS適用

interface InvoiceCreatorProps {
  selectedFolderId: string | undefined;
  closeModal: () => void;
  addNewFile: (newFile: DBMyFile) => Promise<void>; // <- Promise<void> にしておくと安心
  unit: string; // 単位を追加
  editingFile: DBMyFile | null;
  setEditingFile: React.Dispatch<React.SetStateAction<DBMyFile | null>>;
}

interface Item {
  id: number;
  productNumber: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

// InvoiceData型をMyFileから取得
type InvoiceData = NonNullable<DBMyFile['metadata']>['invoiceData'];

// モーダルの内容をコンポーネントとして分離
const InvoiceModal: React.FC<{
  invoiceData: InvoiceData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  closeModal: () => void;
}> = ({ invoiceData, handleInputChange, closeModal }) => {
  if (!invoiceData) {
    return null; // invoiceDataがundefinedの場合は何も表示しない
  }
  return (
    <div className="modal-content">
      <label>
        請求書番号:
        <input type="text" name="invoiceNumber" value={invoiceData.invoiceNumber || ''} onChange={handleInputChange} />
      </label>
      <label>
        取引先:
        <input type="text" name="client" value={invoiceData.client} onChange={handleInputChange} />
      </label>
      <label>
        会社名:
        <input type="text" name="companyName" value={invoiceData.companyName} onChange={handleInputChange} />
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
        適格請求書発行事業者登録番号:
        <input type="text" name="registrationNumber" value={invoiceData.registrationNumber} onChange={handleInputChange} />
      </label>
      <label>
        お振込先:
        <textarea name="bankDetails" value={invoiceData.bankDetails} onChange={handleInputChange} />
      </label>
      <label>
        備考:
        <textarea name="notes" value={invoiceData.notes} onChange={handleInputChange} />
      </label>
      <label>
        印鑑:
        <input type="text" name="seal" value={invoiceData.seal} onChange={handleInputChange} />
      </label>
    </div>
  );
};

const InvoiceCreator: React.FC<InvoiceCreatorProps> = ({
  selectedFolderId,
  closeModal,
  addNewFile,
  unit,
  editingFile,
  setEditingFile
}) => {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    invoiceNumber: '',
    date: '',
    dueDate: '',
    totalAmount: 0,
    client: '',
    subject: '',
    bankDetails: '',
    registrationNumber: '',
    notes: '',
    companyName: '',
  });

  const [items, setItems] = useState<Item[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTaxIncluded, setIsTaxIncluded] = useState(true); // 消費税込みかどうかの状態を追加

  useEffect(() => {
    if (editingFile && editingFile.metadata && editingFile.metadata.invoiceData) {
      setInvoiceData(editingFile.metadata.invoiceData);
    }
  }, [editingFile]);

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
    setItems([...items, { id: Date.now(), productNumber: newProductNumber, productName: '', quantity: 1, unitPrice: 0, unit }]);
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

    if (!invoiceData) {
      console.error('invoiceDataが未定義です');
      return;
    }
    // 1. jsPDFでPDF生成
    const doc = new jsPDF();

    // フォントの埋め込み
    const regularFontUrl = '/fonts/NotoSansJP-Regular.ttf';
    const boldFontUrl = '/fonts/NotoSansJP-Bold.ttf';

    try {
      const regularResponse = await fetch(regularFontUrl);
      const boldResponse = await fetch(boldFontUrl);

      if (!regularResponse.ok || !boldResponse.ok) {
        throw new Error('フォントのフェッチに失敗しました');
      }

      const regularFontBlob = await regularResponse.blob();
      const boldFontBlob = await boldResponse.blob();

      const readAsDataURL = (blob: Blob) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              resolve(reader.result as string);
            } else {
              reject(new Error('ファイルの読み込みに失敗しました'));
            }
          };
          reader.readAsDataURL(blob);
        });
      };

      const regularBase64data = await readAsDataURL(regularFontBlob);
      const regularBase64 = regularBase64data.split(',')[1];

      doc.addFileToVFS('NotoSansJP-Regular.ttf', regularBase64);
      doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');

      const boldBase64data = await readAsDataURL(boldFontBlob);
      const boldBase64 = boldBase64data.split(',')[1];

      doc.addFileToVFS('NotoSansJP-Bold.ttf', boldBase64);
      doc.addFont('NotoSansJP-Bold.ttf', 'NotoSansJP', 'bold');

      // 通常のフォントを設定
      doc.setFont('NotoSansJP', 'normal');
      doc.setFontSize(16);

      // 請求書
      doc.text(`請求書`, 90, 20);
      doc.setFontSize(12); // 文字の大きさを少し小さく
      doc.setFont('NotoSansJP', 'normal'); // フォントを通常に戻す

      // 取引先
      const clientText = `${invoiceData.client || '未設定'} 様`;
      doc.text(clientText, 10, 30);

      // アンダーバーを引く
      const textWidth = doc.getTextWidth(clientText);
      const startX = 10;
      const endX = startX + textWidth;
      doc.line(startX, 31, endX, 31); // アンダーバーを文字列の下に引く

      // 作成日
      // const currentDate = new Date().toLocaleDateString();
      // doc.text(`作成日: ${currentDate}`, 200, 30, { align: 'right' });

      // 作成日を昨日に設定
      const date = new Date();
      date.setDate(date.getDate() - 1);  // 1日引く

      const invoiceDateText = invoiceData.date
        ? new Date(invoiceData.date).toLocaleDateString('ja-JP')
        : '未設定';
      // 請求日を右上に表示
      doc.text(`${invoiceDateText}`, 200, 30, { align: 'right' });

      // PDFに表示する
      doc.text(`${invoiceDateText}`, 200, 30, { align: 'right' });

      // 会社名
      doc.text(`${invoiceData.companyName || '未設定'}`, 200, 40, { align: 'right' });

      // 請求書番号
      doc.text(`請求書番号: ${invoiceData.invoiceNumber || '未設定'}`, 200, 50, { align: 'right' });

      // 案件名
      doc.text(`案件名: ${invoiceData.subject || '未設定'}`, 200, 60, { align: 'right' });

      // 適格請求書発行事業者登録番号
      doc.text(`適格請求書発行事業者登録番号: ${invoiceData.registrationNumber || '未設定'}`, 10, 70);

      // ご請求金額
      if (isTaxIncluded) {
        // 消費税込みの場合
        doc.text(`ご請求金額（税込）:`, 10, 80);
        const totalAmountText = `¥${(invoiceData.totalAmount || 0).toLocaleString()}`;
        doc.text(totalAmountText, 100, 80, { align: 'right' });
        doc.line(10, 82, 100, 82);
      } else {
        // 消費税抜きの場合
        const taxIncludedAmount = (invoiceData.totalAmount || 0) * 1.1;
        doc.text(`ご請求金額（税込）:`, 10, 100);
        doc.text(`¥${taxIncludedAmount.toLocaleString()}`, 100, 100, { align: 'right' });
        doc.line(10, 102, 100, 102);
      }

      // お支払い期限
      const formattedDueDate = invoiceData.dueDate
        ? new Date(invoiceData.dueDate).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).replace(/\//g, '年').replace(/年(\d{2})年/, '年$1月') + '日'
        : '未設定';
      doc.text(`お支払い期限: ${formattedDueDate}`, 10, 110);

      // 印鑑をヘッダーの右下に追加
      if (invoiceData.seal) {
        doc.setTextColor(255, 0, 0);         // 赤文字
        doc.setFont('NotoSansJP', 'bold');   // 太字フォント
        // 一旦12pxぐらいに設定しておく
        let sealFontSize = 12;
        doc.setFontSize(sealFontSize);

        // ページ幅/高さを取得
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 円の半径などを設定
        const circleRadius = 10;
        const circleDiameter = circleRadius * 2;

        // 円の中心座標を計算（右下に配置したい場合）
        const sealX = pageWidth - 20;
        const sealY = pageHeight - 20;

        // 文字幅を取得して、円をはみ出しそうならフォントサイズを下げる
        let textWidth = doc.getTextWidth(invoiceData.seal);
        while (textWidth > circleDiameter - 4 && sealFontSize > 5) {
          sealFontSize--;
          doc.setFontSize(sealFontSize);
          textWidth = doc.getTextWidth(invoiceData.seal);
        }

        // 赤い丸を描画
        doc.setDrawColor(255, 0, 0);
        doc.setLineWidth(0.5);
        doc.circle(sealX, sealY, circleRadius, 'S');

        // 文字を丸の中心に配置
        doc.text(invoiceData.seal, sealX, sealY, {
          align: 'center',
          baseline: 'middle', // 縦方向も中央寄せ
        });
      }

      // テーブルヘッダー
      const tableData = items.map(item => {
        const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
        let taxAmount, totalWithTax;

        // 消費税込みの場合
        if (isTaxIncluded) {
          taxAmount = subtotal / 11;
          totalWithTax = subtotal;
        } else {
          // 消費税抜きの場合
          taxAmount = subtotal * 0.1;
          totalWithTax = subtotal + taxAmount;
        }


        return [
          item.productName || '',
          `${item.quantity || 0} ${item.unit || ''}`, // 数量と単位を結合
          Math.floor(item.unitPrice || 0) ? Math.floor(item.unitPrice).toLocaleString() : '',
          Math.floor(totalWithTax) ? Math.floor(totalWithTax).toLocaleString() : '', // 税込小計
        ];
      });

      // 最低5行を確保
      while (tableData.length < 5) {
        tableData.push(['', '', '', '', '']);
      }

      // 合計金額の計算
      const totalAmount = tableData.reduce((sum, row) => {
        return sum + parseInt(row[3].replace(/,/g, '') || '0', 10);
      }, 0);
      const totalTaxAmount = Math.ceil(totalAmount / 11);

      // テーブルデータに合計を追加
      tableData.push(['消費税 (10%)', '', '', totalTaxAmount.toLocaleString()]);
      tableData.push(['合計金額（税込）', '', '', Math.ceil(totalAmount).toLocaleString()]);

      autoTable(doc, {
        startY: 118,
        head: [['品名', '数量', '単価', '税込小計']],
        body: tableData,
        styles: {
          font: 'NotoSansJP',
          fontSize: 12,
          minCellHeight: 15,
          valign: 'middle'   // ← 縦方向の中央寄せ
        },
        headStyles: {
          fontSize: 14,
          minCellHeight: 15,
          valign: 'middle'   // ← ヘッダーも縦方向の中央寄せ
        }
      });

      // 振込先情報
      doc.setTextColor(0, 0, 0); // 通常の黒色に戻す
      const finalY = (doc as any).lastAutoTable.finalY;
      doc.text(`振込先:  ${invoiceData.bankDetails || '未設定'}`, 10, finalY + 10);

      // 備考
      doc.text(`備考:  ${invoiceData.notes || '未設定'}`, 10, finalY + 20);

      // PDFをBlobとして取得
      const pdfDataUri = doc.output('datauristring');
      const pdfBlob = doc.output('blob');
      const pdfFileName = `請求書_${invoiceData.invoiceNumber || '未設定'}.pdf`;

      // IndexedDB に保存
      const newFile: DBMyFile = {
        id: Date.now().toString(),
        name: pdfFileName,
        folderId: selectedFolderId,
        content: pdfBlob,
        lastModified: new Date(),
        data: pdfDataUri,
        type: 'pdf',
        deleted: 0,
        originalFolderId: selectedFolderId,
        isHidden: false,
        createdAt: new Date(),
        metadata: {
          invoiceData: {
            ...invoiceData,
            isTaxIncluded: isTaxIncluded,
          }
        }
      };

      // 非同期処理を待つ
      await addNewFile(newFile);

      // PDFをダウンロード
      doc.save(pdfFileName);

      // モーダルを閉じる
      closeModal();
    } catch (error) {
      console.error('フォントの読み込みエラー:', error);
    }
  };

  // const openModal = () => {
  //   setIsModalOpen(true);
  // };

  const closeModalHandler = () => {
    setIsModalOpen(false);
  };

  // JSXを返す
  return (
    <div className="invoice-container">
      <h2 className="invoice-title">請求書作成</h2>
      <div className="invoice-form">
        <InvoiceModal invoiceData={invoiceData} handleInputChange={handleInputChange} closeModal={closeModalHandler} />
      </div>

      <h3>品目</h3>
      <div>
        <label>
          <input
            type="radio"
            name="taxOption"
            value="included"
            checked={isTaxIncluded}
            onChange={() => setIsTaxIncluded(true)}
          />
          消費税込み
        </label>
        <label>
          <input
            type="radio"
            name="taxOption"
            value="excluded"
            checked={!isTaxIncluded}
            onChange={() => setIsTaxIncluded(false)}
          />
          消費税抜き
        </label>
      </div>
      <div className="invoice-items">
        <table>
          <thead>
            <tr>
              <th>品名</th>
              <th>数量</th>
              <th>単位</th>
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
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="数量"
                      value={item.quantity}
                      onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="単位"
                    value={item.unit || ''}
                    onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
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

      <h3 className="total-amount">合計金額: ¥{invoiceData?.totalAmount}</h3>
      <button className="save-btn" onClick={createPDF} disabled={!selectedFolderId}>
        PDFとして保存
      </button>
      {isModalOpen && (
        <div className="modal">
          <h2>編集モーダル</h2>
          <InvoiceModal
            invoiceData={editingFile?.metadata?.invoiceData || {}}
            handleInputChange={handleInputChange}
            closeModal={closeModalHandler}
          />
        </div>
      )}

    </div>
  );
};

export default InvoiceCreator;
