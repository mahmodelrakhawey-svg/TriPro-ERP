import type { Item } from '../ProductManager';

export const printOfferBarcode = (item: Item) => {
  const printWindow = window.open('', '', 'width=600,height=400');
  if (printWindow) {
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>باركود العرض - ${item.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Tajawal', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
          .label { 
            width: 300px; 
            height: 200px; 
            background: white; 
            border: 1px solid #ccc; 
            padding: 15px; 
            text-align: center; 
            display: flex; 
            flex-direction: column; 
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            border-radius: 8px;
          }
          .title { font-size: 16px; font-weight: bold; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
          .prices { display: flex; justify-content: center; align-items: baseline; gap: 10px; margin: 5px 0; }
          .old-price { text-decoration: line-through; color: #666; font-size: 14px; }
          .new-price { font-size: 28px; font-weight: 900; color: #000; }
          .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 48px; line-height: 1; margin: 5px 0; }
          .tag { background: #ef4444; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; margin-bottom: 5px; }
          @media print {
            body { background: none; }
            .label { border: none; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="tag">عرض خاص 🔥</div>
          <div class="title">${item.name}</div>
          <div class="prices">
            <span class="old-price">${item.sales_price.toLocaleString()}</span>
            <span class="new-price">${item.offer_price?.toLocaleString()}</span>
          </div>
          <div class="barcode">*${item.sku || '0000'}*</div>
          <div style="font-size: 10px; margin-top: 5px;">${item.sku || ''}</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};

export const printBarcode = (item: Item) => {
  const printWindow = window.open('', '', 'width=800,height=600');
  if (printWindow) {
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>طباعة باركود - ${item.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Tajawal', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
          .label { 
            width: 50mm; 
            height: 30mm; 
            background: white; 
            border: 1px solid #ccc; 
            padding: 2px; 
            text-align: center; 
            display: flex; 
            flex-direction: column; 
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            border-radius: 4px;
          }
          .title { font-size: 10px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
          .price { font-size: 14px; font-weight: 900; color: #000; margin: 2px 0; }
          .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 32px; line-height: 1; margin: 2px 0; }
          @media print {
            body { background: none; }
            .label { border: none; page-break-inside: avoid; margin: 0 auto; }
            @page { size: 50mm 30mm; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="title">${item.name}</div>
          <div class="barcode">*${item.sku || '0000'}*</div>
          <div style="font-size: 8px;">${item.sku || ''}</div>
          <div class="price">${item.sales_price?.toLocaleString()}</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};

export const printBulkBarcodes = (selectedItems: Item[]) => {
  if (selectedItems.length === 0) return;

  const printWindow = window.open('', '', 'width=800,height=600');
  if (printWindow) {
    printWindow.document.write(`
      <html dir="rtl">
      <head>
        <title>طباعة الباركود</title>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Tajawal', sans-serif; padding: 20px; background-color: #fff; }
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
          .label { 
            border: 1px solid #eee; 
            padding: 2px; 
            text-align: center; 
            display: flex; 
            flex-direction: column; 
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            border-radius: 4px;
            page-break-inside: avoid;
            width: 50mm; height: 30mm;
            margin: 0 auto;
          }
          .title { font-size: 10px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
          .price { font-size: 14px; font-weight: 900; color: #000; margin: 2px 0; }
          .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 32px; line-height: 1; margin: 2px 0; }
          @media print {
            .no-print { display: none; }
            .grid { display: block; }
            .label { 
              border: none;
              page-break-after: always;
            }
            @page { size: 50mm 30mm; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: center;">
          <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-family: inherit; font-weight: bold; cursor: pointer;">🖨️ طباعة الملصقات (${selectedItems.length})</button>
        </div>
        <div class="grid">
          ${selectedItems.map(item => `
            <div class="label">
              <div class="title">${item.name}</div>
              <div class="barcode">*${item.sku || '0000'}*</div>
              <div style="font-size: 8px;">${item.sku || ''}</div>
              <div class="price">${item.sales_price?.toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
};
