import React, { useState, useEffect, useRef } from 'react';
import { Package, PlusCircle, ScanLine, ListOrdered, Tag, CheckCircle2, AlertCircle, LayoutDashboard, Download, Camera, X, Upload } from 'lucide-react';

// --- Configuration ---
const RESET_PASSWORD = "9999"; // Add your secret numeric PIN here

// --- IndexedDB Helper Functions ---
const DB_NAME = 'SareeOfflineDB';
const STORE_NAME = 'KeyValueStore';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const setDBItem = async (key, value) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getDBItem = async (key) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sarees, setSarees] = useState([]);
  const [sales, setSales] = useState([]);
  const [notification, setNotification] = useState(null);
  const [isDBLoaded, setIsDBLoaded] = useState(false);
  
  // New POS States
  const [cart, setCart] = useState([]);
  const [scanMode, setScanMode] = useState('SELL'); // 'SELL' or 'RETURN'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI'); 
  const [showResetModal, setShowResetModal] = useState(false); // Reset confirmation state
  
  // Hidden Reset States
  const [resetPassword, setResetPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [devClickCount, setDevClickCount] = useState(0);

  // Hoisted Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef(null);
  const clickTimeoutRef = useRef(null);

  // Load data from local offline storage on startup
  useEffect(() => {
    const loadData = async () => {
      try {
        let savedSarees = await getDBItem('saree_inventory');
        let savedSales = await getDBItem('saree_sales');

        if (!savedSarees && localStorage.getItem('saree_inventory')) {
          savedSarees = JSON.parse(localStorage.getItem('saree_inventory'));
          await setDBItem('saree_inventory', savedSarees);
        }
        if (!savedSales && localStorage.getItem('saree_sales')) {
          savedSales = JSON.parse(localStorage.getItem('saree_sales'));
          await setDBItem('saree_sales', savedSales);
        }

        if (savedSarees) setSarees(savedSarees);
        if (savedSales) setSales(savedSales);
      } catch (error) {
        console.error("Database load error:", error);
      } finally {
        setIsDBLoaded(true);
      }
    };

    loadData();
    
    // Dynamically load the QR Scanner library
    if (!document.getElementById('html5-qrcode-script')) {
      const script = document.createElement('script');
      script.id = 'html5-qrcode-script';
      script.src = 'https://unpkg.com/html5-qrcode';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Save data to IndexedDB whenever it changes
  useEffect(() => {
    if (isDBLoaded) {
      setDBItem('saree_inventory', sarees);
      setDBItem('saree_sales', sales);
    }
  }, [sarees, sales, isDBLoaded]);

  // Handle Tab Switch safely to prevent Camera Crashes
  const handleTabChange = async (newTab) => {
    if (activeTab === 'scan' && isCameraActive && scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Scanner stop error:", err);
      }
      setIsCameraActive(false);
    }
    setActiveTab(newTab);
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // --- BUSINESS LOGIC ---

  // Hidden trigger logic for 5 quick taps
  const handleHiddenResetTrigger = () => {
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    setDevClickCount(prev => {
      if (prev + 1 >= 5) {
        setShowResetModal(true);
        setResetPassword('');
        setPasswordError('');
        return 0;
      }
      return prev + 1;
    });
    // Reset the click count if they stop tapping for 1 second
    clickTimeoutRef.current = setTimeout(() => setDevClickCount(0), 1000);
  };

  const performFactoryReset = async () => {
    // Clear state
    setSarees([]);
    setSales([]);
    setCart([]);
    // Clear databases
    await setDBItem('saree_inventory', []);
    await setDBItem('saree_sales', []);
    localStorage.removeItem('saree_inventory');
    localStorage.removeItem('saree_sales');
    
    setShowResetModal(false);
    showNotification('All inventory and sales data cleared successfully.', 'success');
  };

  const handleAddSaree = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const code = formData.get('code').toUpperCase();
    
    // Prevent duplicate codes
    if (sarees.some(s => s.code === code)) {
      showNotification('This Product Code already exists!', 'error');
      return;
    }

    const newSaree = {
      id: Date.now().toString(),
      code: code,
      shopName: formData.get('shopName') || 'Unknown Shop',
      shopCode: formData.get('shopCode') || 'N/A',
      type: formData.get('type') || 'Cotton',
      cp: parseFloat(formData.get('cp')) || 0,
      mrp: parseFloat(formData.get('mrp')) || 0,
      asp60: parseFloat(formData.get('asp60')) || 0,
      status: 'available',
      dateAdded: new Date().toISOString()
    };

    setSarees([newSaree, ...sarees]);
    showNotification(`Saree added! Code: ${code}`);
    e.target.reset();
  };

  const handleScanInput = (codeToScan) => {
    if (!codeToScan) return;
    codeToScan = codeToScan.trim().toUpperCase();

    if (scanMode === 'SELL') {
      addToCart(codeToScan);
    } else {
      processReturn(codeToScan);
    }
  };

  const addToCart = (codeToScan) => {
    const saree = sarees.find(s => s.code === codeToScan);
    
    if (!saree) {
      showNotification(`Code ${codeToScan} not found in inventory!`, 'error');
      return false;
    }
    if (saree.status === 'sold') {
      showNotification(`Alert: ${codeToScan} is already SOLD!`, 'error');
      return false;
    }
    if (cart.some(item => item.saree.code === codeToScan)) {
      showNotification(`${codeToScan} is already in the cart!`, 'error');
      return false;
    }

    // Add to cart with default selection as MRP
    setCart([...cart, { 
      saree, 
      selection: 'MRP', 
      customPrice: saree.mrp || '' 
    }]);
    
    showNotification(`Added ${codeToScan} to Cart.`, 'success');
    return true;
  };

  const processReturn = (codeToScan) => {
    const sareeIndex = sarees.findIndex(s => s.code === codeToScan);
    
    if (sareeIndex === -1) {
      showNotification(`Code ${codeToScan} not found in inventory!`, 'error');
      return false;
    }
    if (sarees[sareeIndex].status === 'available') {
      showNotification(`${codeToScan} is already marked as available.`, 'error');
      return false;
    }

    // Mark as available
    const updatedSarees = [...sarees];
    updatedSarees[sareeIndex] = { ...updatedSarees[sareeIndex], status: 'available' };
    setSarees(updatedSarees);

    // Remove from sales log (or mark as returned)
    const updatedSales = sales.filter(sale => sale.sareeCode !== codeToScan);
    setSales(updatedSales);

    showNotification(`Return Successful! ${codeToScan} is back in inventory.`, 'success');
    return true;
  };

  const updateCartItemPrice = (index, selection, customVal = '') => {
    const newCart = [...cart];
    newCart[index].selection = selection;
    if (selection === 'CUSTOM') {
      newCart[index].customPrice = customVal;
    }
    setCart(newCart);
  };

  const removeCartItem = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const calculateCartTotal = () => {
    return cart.reduce((total, item) => {
      if (item.selection === 'MRP') return total + (item.saree.mrp || 0);
      if (item.selection === 'ASP60') return total + (item.saree.asp60 || 0);
      return total + (parseFloat(item.customPrice) || 0);
    }, 0);
  };

  const completeSaleTransaction = () => {
    if (cart.length === 0) return;

    const updatedSarees = [...sarees];
    const newSales = [];
    const timestamp = new Date().toLocaleString();

    cart.forEach(cartItem => {
      const sIdx = updatedSarees.findIndex(s => s.code === cartItem.saree.code);
      if (sIdx > -1) {
        updatedSarees[sIdx] = { ...updatedSarees[sIdx], status: 'sold' };
      }

      let finalPrice = cartItem.selection === 'MRP' ? cartItem.saree.mrp : 
                       cartItem.selection === 'ASP60' ? cartItem.saree.asp60 : 
                       parseFloat(cartItem.customPrice) || 0;

      newSales.push({
        id: Date.now().toString() + Math.random().toString().slice(2, 8),
        sareeCode: cartItem.saree.code,
        salePrice: finalPrice,
        paymentMethod: paymentMethod,
        saleDate: timestamp
      });
    });

    setSarees(updatedSarees);
    setSales([...newSales, ...sales]);
    setCart([]); 
    setShowPaymentModal(false);
    setPaymentMethod('UPI'); // Reset default
    showNotification(`Sale Completed! ${cart.length} items sold.`);
  };

  // --- CAMERA SCANNER LOGIC ---

  const startCameraScanner = () => {
    if (!window.Html5Qrcode) {
      showNotification("Scanner library loading, try again.", "error");
      return;
    }
    setIsCameraActive(true);
    
    setTimeout(() => {
      const html5QrCode = new window.Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      
      // Force the camera to display as a square (aspectRatio: 1.0)
      html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log('Audio blocked'));
          
          handleScanInput(decodedText);
          stopCameraScanner();
        },
        (errorMessage) => { }
      ).catch(err => {
        console.error("Camera Error:", err);
        showNotification("Could not access camera.", "error");
        setIsCameraActive(false);
      });
    }, 100);
  };

  const stopCameraScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        scannerRef.current.clear();
        setIsCameraActive(false);
      }).catch(console.error);
    } else {
      setIsCameraActive(false);
    }
  };

  // Handle CSV Upload based on NEW Format: Shop_Name | Shop_Code | CP | MRP | ASP60 | Product_Code | Item_Status
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n');
        const delimiter = text.includes('|') ? '|' : ',';
        
        const parseCSVRow = (str) => {
          const result = [];
          let cell = '';
          let inQuotes = false;
          for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '"' && str[i+1] === '"') { cell += '"'; i++; } 
            else if (char === '"') { inQuotes = !inQuotes; }
            else if (char === delimiter && !inQuotes) { result.push(cell.trim()); cell = ''; }
            else { cell += char; }
          }
          result.push(cell.trim());
          return result;
        };

        const headers = parseCSVRow(rows[0]).map(h => h.toLowerCase().replace(/"/g, '').trim());
        
        // Find Column Indices based on the requested structure
        const shopNameIdx = headers.findIndex(h => h.includes('shop_name') || h === 'shop name' || h === 'shopname');
        const shopCodeIdx = headers.findIndex(h => h.includes('shop_code') || h === 'shop code' || h === 'shopcode');
        const codeIdx = headers.findIndex(h => h.includes('product_code') || h === 'product code' || h === 'productcode' || h === 'code');
        const cpIdx = headers.findIndex(h => h === 'cp' || h.includes('cost'));
        const mrpIdx = headers.findIndex(h => h === 'mrp');
        const aspIdx = headers.findIndex(h => h.includes('asp60') || h === 'asp');
        const statusIdx = headers.findIndex(h => h.includes('status'));

        if (codeIdx === -1) {
          showNotification('Error: CSV must have a "Product_Code" column', 'error');
          return;
        }

        const newSarees = [];
        let addedCount = 0;
        let duplicateCount = 0;

        for (let i = 1; i < rows.length; i++) {
          if (!rows[i].trim()) continue;

          const values = parseCSVRow(rows[i]);
          const code = values[codeIdx]?.replace(/"/g, '').toUpperCase();
          
          if (!code) continue;

          if (sarees.some(s => s.code === code) || newSarees.some(s => s.code === code)) {
            duplicateCount++;
            continue;
          }

          let statusStr = statusIdx !== -1 && values[statusIdx] ? values[statusIdx].toLowerCase().trim() : 'available';
          if (!statusStr.includes('sold')) statusStr = 'available';

          newSarees.push({
            id: Date.now().toString() + i,
            code: code,
            shopName: shopNameIdx !== -1 && values[shopNameIdx] ? values[shopNameIdx].replace(/"/g, '') : 'Unknown Shop',
            shopCode: shopCodeIdx !== -1 && values[shopCodeIdx] ? values[shopCodeIdx].replace(/"/g, '') : 'N/A',
            cp: cpIdx !== -1 && values[cpIdx] ? parseFloat(values[cpIdx].replace(/[^\d.-]/g, '')) || 0 : 0,
            mrp: mrpIdx !== -1 && values[mrpIdx] ? parseFloat(values[mrpIdx].replace(/[^\d.-]/g, '')) || 0 : 0,
            asp60: aspIdx !== -1 && values[aspIdx] ? parseFloat(values[aspIdx].replace(/[^\d.-]/g, '')) || 0 : 0,
            status: statusStr,
            dateAdded: new Date().toISOString()
          });
          addedCount++;
        }

        if (addedCount > 0) {
          setSarees(prev => [...newSarees, ...prev]);
          showNotification(`Imported ${addedCount} items. (${duplicateCount} duplicates skipped)`);
        } else {
          showNotification(`No items imported. ${duplicateCount} duplicates found.`, 'error');
        }
      } catch (err) {
        showNotification('Error reading file. Ensure valid CSV.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const exportToCSV = (data, filename) => {
    if (data.length === 0) {
      showNotification('No data available to export!', 'error');
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => 
      Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    );
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification(`${filename} downloaded successfully!`);
  };

  // --- UI RENDER FUNCTIONS ---

  const renderDashboardView = () => {
    const totalRevenue = sales.reduce((sum, sale) => sum + (sale.salePrice || 0), 0);
    const cashRevenue = sales.filter(s => s.paymentMethod === 'Cash').reduce((sum, sale) => sum + (sale.salePrice || 0), 0);
    const upiRevenue = sales.filter(s => s.paymentMethod === 'UPI').reduce((sum, sale) => sum + (sale.salePrice || 0), 0);

    return (
      <div className="space-y-6 flex-1 w-full">
        <h2 
          onClick={handleHiddenResetTrigger} 
          className="text-xl font-bold text-gray-900 select-none cursor-pointer active:text-blue-600 transition-colors"
        >
          Exhibition Dashboard
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-100 p-4 rounded-xl shadow-sm border border-blue-200">
            <p className="text-blue-900 text-sm font-semibold">Available Inventory</p>
            <p className="text-3xl font-bold text-blue-900">{sarees.filter(s => s.status === 'available').length}</p>
          </div>
          <div className="bg-green-100 p-4 rounded-xl shadow-sm border border-green-200">
            <p className="text-green-900 text-sm font-semibold">Items Sold</p>
            <p className="text-3xl font-bold text-green-900">{sales.length}</p>
          </div>
          <div className="bg-purple-100 p-4 rounded-xl shadow-sm border border-purple-200 col-span-2">
            <p className="text-purple-900 text-sm font-semibold">Total Revenue</p>
            <p className="text-3xl font-bold text-purple-900 mb-2">
              ₹{totalRevenue.toLocaleString()}
            </p>
            <div className="flex justify-between border-t border-purple-200 pt-3 mt-1">
              <div>
                <p className="text-purple-800 text-xs font-semibold uppercase">Cash Sales</p>
                <p className="text-lg font-bold text-purple-900">₹{cashRevenue.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-purple-800 text-xs font-semibold uppercase">UPI Sales</p>
                <p className="text-lg font-bold text-purple-900">₹{upiRevenue.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Download size={18} className="text-blue-600" /> End of Day Backup
          </h3>
          <p className="text-sm text-gray-700 mb-4">Export offline data to a CSV file to sync with main computer.</p>
          <div className="flex gap-2">
            <button onClick={() => exportToCSV(sales, 'Sales_Log')} className="flex-1 bg-green-50 text-green-800 border border-green-300 font-semibold py-3 rounded-lg hover:bg-green-100 transition-colors text-sm">
              Export Sales
            </button>
            <button onClick={() => exportToCSV(sarees, 'Inventory_Master')} className="flex-1 bg-blue-50 text-blue-800 border border-blue-300 font-semibold py-3 rounded-lg hover:bg-blue-100 transition-colors text-sm">
              Export Inventory
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAddInventoryView = () => (
    <div className="space-y-4 flex-1 w-full">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Add/Import Inventory</h2>
      
      {/* Bulk Upload Section */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Upload size={20} className="text-blue-600" /> Bulk Import from CSV
        </h3>
        <p className="text-xs text-gray-600 mb-4">Columns MUST include: <b>Shop_Name, Shop_Code, CP, MRP, ASP60, Product_Code, Item_Status</b>.</p>
        
        <label className="flex justify-center items-center w-full h-16 px-4 transition bg-blue-50 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer hover:border-blue-400">
            <span className="flex items-center space-x-2 text-blue-700 font-bold">
                <Upload size={20} />
                <span>Select CSV File</span>
            </span>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
        </label>
      </div>

      <div className="flex items-center gap-4 my-2">
        <div className="h-px bg-gray-300 flex-1"></div>
        <span className="text-xs text-gray-500 font-bold uppercase">Or Add Single Item</span>
        <div className="h-px bg-gray-300 flex-1"></div>
      </div>

      {/* Manual Single Entry Form */}
      <form onSubmit={handleAddSaree} className="space-y-4 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-1">Product Code</label>
          <input required name="code" type="text" className="w-full p-3 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none uppercase font-mono" placeholder="e.g. SAR101" />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-1">Type</label>
          <input name="type" type="text" className="w-full p-3 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none" placeholder="e.g. Cotton" />
        </div>
        
        <div className="flex gap-2 w-full">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-bold text-gray-900 mb-1">Shop Name</label>
            <input name="shopName" type="text" className="w-full p-3 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none" placeholder="e.g. Sharma Textiles" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-bold text-gray-900 mb-1">Shop Code</label>
            <input name="shopCode" type="text" className="w-full p-3 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none uppercase font-mono" placeholder="e.g. SHARMA01" />
          </div>
        </div>
        
        {/* Uses flex layout to squeeze tightly on narrow screens without overflowing */}
        <div className="flex gap-2 w-full">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold text-gray-900 mb-1">CP (Cost)</label>
            <input required name="cp" type="number" min="0" className="w-full p-2 bg-gray-50 text-gray-900 border border-gray-300 rounded-lg outline-none" placeholder="0" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold text-gray-900 mb-1">MRP</label>
            <input required name="mrp" type="number" min="0" className="w-full p-2 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none" placeholder="0" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-bold text-gray-900 mb-1">ASP60</label>
            <input required name="asp60" type="number" min="0" className="w-full p-2 bg-white text-gray-900 border border-gray-300 rounded-lg outline-none" placeholder="0" />
          </div>
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 mt-2 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
          <PlusCircle size={20} /> Add to Inventory
        </button>
      </form>
    </div>
  );

  const renderInventoryListView = () => (
    <div className="space-y-4 flex-1 w-full">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Current Inventory</h2>
      {sarees.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
           <p className="text-gray-600 font-medium">No sarees in inventory yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sarees.map((saree) => (
            <div key={saree.id} className={`p-4 rounded-xl border ${saree.status === 'sold' ? 'bg-gray-100 border-gray-300' : 'bg-white border-blue-200 shadow-sm'} flex justify-between items-center`}>
              <div className="w-full">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono bg-gray-200 text-gray-900 px-2 py-1 rounded text-sm font-bold">{saree.code}</span>
                  {saree.status === 'sold' && <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-bold">SOLD</span>}
                </div>
                <h3 className={`font-bold ${saree.status === 'sold' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {saree.shopName} <span className="text-xs text-gray-500 font-mono font-normal ml-1">({saree.shopCode})</span>
                </h3>
                
                <div className="flex gap-3 mt-2 text-sm">
                  <div className="bg-gray-50 px-2 py-1 rounded border border-gray-200">
                    <span className="text-gray-500 text-xs block leading-none">MRP</span>
                    <span className="font-bold text-gray-700">₹{saree.mrp}</span>
                  </div>
                  <div className="bg-green-50 px-2 py-1 rounded border border-green-200">
                    <span className="text-green-600 text-xs block leading-none">ASP60</span>
                    <span className="font-bold text-green-700">₹{saree.asp60}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPointOfSaleView = () => (
    <div className="flex-1 flex flex-col w-full pb-10">
      
      {/* Toggle Mode */}
      <div className="flex bg-gray-200 p-1 rounded-lg mb-4 shrink-0">
        <button 
          onClick={() => { setScanMode('SELL'); stopCameraScanner(); }} 
          className={`flex-1 py-2 font-bold rounded-md transition-colors ${scanMode === 'SELL' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}
        >
          Checkout Cart
        </button>
        <button 
          onClick={() => { setScanMode('RETURN'); stopCameraScanner(); }} 
          className={`flex-1 py-2 font-bold rounded-md transition-colors ${scanMode === 'RETURN' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500'}`}
        >
          Process Return
        </button>
      </div>

      {/* Scanner Block */}
      <div className={`bg-gray-900 rounded-xl p-4 text-center text-white shadow-lg transition-all shrink-0`}>
        {!isCameraActive ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">
                {scanMode === 'SELL' ? 'Scan to Add' : 'Scan to Return'}
              </h2>
              <button onClick={startCameraScanner} className="bg-blue-600 p-2 rounded-lg text-white">
                <Camera size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleScanInput(e.target.scanCode.value); e.target.reset(); }} className="flex gap-2 w-full">
              <input autoFocus required name="scanCode" type="text" placeholder="Product Code" className="flex-1 w-full min-w-0 p-3 bg-white text-gray-900 rounded-lg font-mono uppercase outline-none" />
              <button type="submit" className={`font-bold px-4 shrink-0 rounded-lg transition-colors text-white ${scanMode === 'SELL' ? 'bg-green-600' : 'bg-red-600'}`}>
                {scanMode === 'SELL' ? 'ADD' : 'RETURN'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center w-full h-full">
            <div className="flex justify-between w-full mb-2">
              <h3 className="font-bold text-white">Scanning...</h3>
              <button onClick={stopCameraScanner} className="text-red-400"><X size={20} /></button>
            </div>
            <div id="reader" className="w-full aspect-square bg-black rounded-lg overflow-hidden border-2 border-dashed border-gray-500"></div>
          </div>
        )}
      </div>

      {/* Cart Display (Only in SELL mode) */}
      {scanMode === 'SELL' && (
        <div className="mt-4 flex-1 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex justify-between items-center">
            Current Cart
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{cart.length} Items</span>
          </h3>
          
          {cart.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl flex-1 flex flex-col items-center justify-center p-6">
               <Package size={48} className="text-gray-300 mb-2" />
               <p className="text-gray-400 font-medium">Cart is empty. Scan an item.</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto mb-4 border-b border-gray-200 pb-4">
              {cart.map((item, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-mono font-bold text-sm text-gray-900">{item.saree.code}</span>
                      <p className="text-xs text-gray-500 truncate max-w-[180px]">{item.saree.shopName} ({item.saree.shopCode})</p>
                    </div>
                    <button onClick={() => removeCartItem(idx)} className="text-red-500 p-1 bg-red-50 rounded shrink-0">
                      <X size={16} />
                    </button>
                  </div>

                  {/* Price Selection - Flex container prevents overflow on narrow screens */}
                  <div className="flex gap-1 mt-2 w-full">
                    <button 
                      onClick={() => updateCartItemPrice(idx, 'MRP')}
                      className={`text-[10px] p-2 flex-1 rounded border font-bold flex flex-col items-center ${item.selection === 'MRP' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                    >
                      <span>MRP</span>
                      <span>₹{item.saree.mrp}</span>
                    </button>
                    <button 
                      onClick={() => updateCartItemPrice(idx, 'ASP60')}
                      className={`text-[10px] p-2 flex-1 rounded border font-bold flex flex-col items-center ${item.selection === 'ASP60' ? 'bg-green-50 border-green-400 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                    >
                      <span>ASP60</span>
                      <span>₹{item.saree.asp60}</span>
                    </button>
                    <button 
                      onClick={() => updateCartItemPrice(idx, 'CUSTOM')}
                      className={`text-[10px] p-2 flex-1 rounded border font-bold flex flex-col items-center ${item.selection === 'CUSTOM' ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                    >
                      <span>Custom</span>
                      <span>Fixed</span>
                    </button>
                  </div>

                  {/* Custom Price Input */}
                  {item.selection === 'CUSTOM' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-600">Enter Price: ₹</span>
                      <input 
                        type="number" 
                        value={item.customPrice}
                        onChange={(e) => updateCartItemPrice(idx, 'CUSTOM', e.target.value)}
                        className="flex-1 w-full min-w-0 p-2 bg-white text-gray-900 border border-gray-300 rounded outline-none font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Total and Checkout Button */}
          {cart.length > 0 && (
            <div className="mt-auto bg-white p-4 rounded-xl shadow-md border border-gray-200">
              <div className="flex justify-between items-end mb-4">
                <span className="text-gray-600 font-bold">Total Amount:</span>
                <span className="text-3xl font-black text-gray-900">₹{calculateCartTotal().toLocaleString()}</span>
              </div>
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="w-full bg-green-600 text-white font-black py-4 rounded-xl text-lg hover:bg-green-700"
              >
                Checkout Items
              </button>
            </div>
          )}
        </div>
      )}

      {/* Return Mode Dashboard (Only in RETURN mode) */}
      {scanMode === 'RETURN' && (
        <div className="mt-4 flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="bg-red-50 p-4 rounded-full mb-4">
             <Package size={48} className="text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Return Mode Active</h3>
          <p className="text-gray-500 font-medium text-center text-sm">
            Scan an item or enter its code above to process a return.
          </p>
          <p className="text-xs text-gray-400 mt-2 text-center">
            The item will be immediately moved back to your available inventory and removed from the active sales log.
          </p>
        </div>
      )}
    </div>
  );

  const renderSalesLogView = () => (
    <div className="space-y-4 flex-1 w-full">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Sales Log</h2>
      {sales.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
           <p className="text-gray-600 font-medium">No sales recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-200">
            {sales.map((sale) => (
              <div key={sale.id} className="p-4 flex justify-between items-center bg-white hover:bg-gray-50">
                <div>
                  <p className="font-bold text-gray-900 font-mono text-lg">{sale.sareeCode}</p>
                  <p className="text-xs text-gray-500 mt-1">{sale.saleDate}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-700 text-lg">₹{sale.salePrice}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-600 mt-1 justify-end font-medium">
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-gray-500">{sale.paymentMethod || 'CASH'}</span>
                    <CheckCircle2 size={14} className="text-green-600" /> Paid
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-gray-100 flex flex-col font-sans overflow-hidden text-gray-900 sm:shadow-2xl sm:border-x border-gray-300">
      
      {/* Header */}
      <div className="bg-blue-900 text-white p-4 pt-6 shadow-md z-20 flex justify-between items-center shrink-0 w-full">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-white">
            <Tag size={24} className="text-blue-300" />
            SareeOffline PoS
          </h1>
          <p className="text-blue-200 text-xs mt-1 font-medium">Local Exhibition Mode (Offline)</p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`absolute top-20 left-4 right-4 p-4 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-bounce ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {notification.type === 'error' ? <AlertCircle size={24} className="shrink-0 text-white" /> : <CheckCircle2 size={24} className="shrink-0 text-white" />}
          <p className="font-bold text-sm text-white">{notification.message}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto w-full relative z-0">
        <div className="p-4 pb-32 flex flex-col min-h-full">
          {activeTab === 'dashboard' && renderDashboardView()}
          {activeTab === 'add' && renderAddInventoryView()}
          {activeTab === 'inventory' && renderInventoryListView()}
          {activeTab === 'scan' && renderPointOfSaleView()}
          {activeTab === 'log' && renderSalesLogView()}
        </div>
      </div>

      {/* Payment Modal Overlay */}
      {showPaymentModal && (
        <div className="absolute inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col items-center shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1">Receive Payment</h2>
            <p className="text-gray-500 mb-4 text-sm text-center">Amount due: <b className="text-gray-900 text-lg">₹{calculateCartTotal().toLocaleString()}</b></p>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 w-full flex flex-col items-center mb-6 justify-center">
              <p className="text-sm text-gray-600 text-center mb-4">Select payment method received:</p>
              <div className="flex w-full gap-2">
                <button 
                  onClick={() => setPaymentMethod('Cash')}
                  className={`flex-1 py-3 rounded-lg font-bold transition-colors ${paymentMethod === 'Cash' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 text-gray-600'}`}
                >
                  CASH
                </button>
                <button 
                  onClick={() => setPaymentMethod('UPI')}
                  className={`flex-1 py-3 rounded-lg font-bold transition-colors ${paymentMethod === 'UPI' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-600'}`}
                >
                  UPI
                </button>
              </div>
            </div>

            <button 
              onClick={completeSaleTransaction}
              className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl text-lg hover:bg-black mb-3 shadow-md"
            >
              Confirm Sale
            </button>
            <button 
              onClick={() => setShowPaymentModal(false)}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200"
            >
              Cancel Checkout
            </button>
          </div>
        </div>
      )}

      {/* Database Reset Confirmation Modal Overlay */}
      {showResetModal && (
        <div className="absolute inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col items-center shadow-2xl border-4 border-red-500">
            <div className="bg-red-100 p-4 rounded-full mb-4">
               <AlertCircle size={48} className="text-red-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2 text-center">Factory Reset</h2>
            <p className="text-gray-500 mb-4 text-sm text-center">Enter the security PIN to permanently delete all data.</p>
            
            <input 
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter PIN"
              value={resetPassword}
              onChange={(e) => {
                  setResetPassword(e.target.value);
                  setPasswordError('');
              }}
              className="w-full p-4 text-center text-2xl tracking-widest bg-gray-100 text-gray-900 border-2 border-gray-300 rounded-xl mb-2 focus:border-red-500 outline-none font-bold"
            />
            {passwordError && <p className="text-red-600 text-xs font-bold mb-2">{passwordError}</p>}
            {!passwordError && <div className="mb-2"></div>}
            
            <button 
              onClick={() => {
                if (resetPassword === RESET_PASSWORD) {
                  performFactoryReset();
                } else {
                  setPasswordError('Incorrect PIN');
                }
              }}
              className="w-full bg-red-600 text-white font-bold py-4 rounded-xl text-lg hover:bg-red-700 mb-3 shadow-md"
            >
              Yes, Wipe Everything
            </button>
            <button 
              onClick={() => {
                setShowResetModal(false);
                setResetPassword('');
                setPasswordError('');
              }}
              className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bg-white border-t border-gray-300 flex justify-between gap-1 px-2 py-2 absolute bottom-0 left-0 right-0 w-full z-40 pb-6 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)]">
        <NavButton icon={<LayoutDashboard />} label="Home" active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} />
        <NavButton icon={<PlusCircle />} label="Add" active={activeTab === 'add'} onClick={() => handleTabChange('add')} />
        <NavButton icon={<ScanLine />} label="Scan" active={activeTab === 'scan'} onClick={() => handleTabChange('scan')} highlight />
        <NavButton icon={<Package />} label="Stock" active={activeTab === 'inventory'} onClick={() => handleTabChange('inventory')} />
        <NavButton icon={<ListOrdered />} label="Sales" active={activeTab === 'log'} onClick={() => handleTabChange('log')} />
      </div>
    </div>
  );
}

const NavButton = ({ icon, label, active, onClick, highlight }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 min-w-0 rounded-xl transition-all h-14
      ${highlight 
        ? 'bg-blue-600 text-white -mt-8 shadow-xl border-4 border-gray-100 flex-none w-14 max-w-[56px] aspect-square' 
        : active ? 'text-blue-700 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 font-medium'
      }`}
  >
    {React.cloneElement(icon, { size: highlight ? 24 : 20 })}
    <span className={`text-[9px] mt-1 truncate w-full px-1 ${highlight ? 'hidden' : 'block'}`}>{label}</span>
  </button>
);