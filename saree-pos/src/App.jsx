import React, { useState, useEffect, useRef } from 'react';
import { Package, PlusCircle, ScanLine, ListOrdered, Tag, CheckCircle2, AlertCircle, LayoutDashboard, Download, Camera, X } from 'lucide-react';

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

  // Load data from local offline storage on startup
  useEffect(() => {
    const loadData = async () => {
      try {
        let savedSarees = await getDBItem('saree_inventory');
        let savedSales = await getDBItem('saree_sales');

        // Migration: If IndexedDB is empty but localStorage has data, move it over
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
    
    // Dynamically load the QR Scanner library for offline capability
    if (!document.getElementById('html5-qrcode-script')) {
      const script = document.createElement('script');
      script.id = 'html5-qrcode-script';
      script.src = 'https://unpkg.com/html5-qrcode';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Save data to IndexedDB whenever it changes (only after initial DB load)
  useEffect(() => {
    if (isDBLoaded) {
      setDBItem('saree_inventory', sarees);
      setDBItem('saree_sales', sales);
    }
  }, [sarees, sales, isDBLoaded]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // --- BUSINESS LOGIC ---

  // 1. Generate Product Code
  const generateProductCode = (type, price) => {
    const typePrefix = type.substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `SAR-${typePrefix}-${randomNum}`;
  };

  // 2. Add to Inventory
  const handleAddSaree = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const type = formData.get('type');
    const price = parseFloat(formData.get('price'));
    
    const newCode = generateProductCode(type, price);
    
    const newSaree = {
      id: Date.now().toString(),
      code: newCode,
      name,
      type,
      price,
      status: 'available',
      dateAdded: new Date().toISOString()
    };

    setSarees([newSaree, ...sarees]);
    showNotification(`Saree added! Code: ${newCode}`);
    e.target.reset();
  };

  // 3. Process Sale
  const processSale = (codeToScan) => {
    const sareeIndex = sarees.findIndex(s => s.code === codeToScan);
    
    if (sareeIndex === -1) {
      showNotification(`Code ${codeToScan} not found in inventory!`, 'error');
      return false;
    }

    if (sarees[sareeIndex].status === 'sold') {
      showNotification(`Alert: ${codeToScan} is already marked as SOLD!`, 'error');
      return false;
    }

    // Mark as sold
    const updatedSarees = [...sarees];
    updatedSarees[sareeIndex].status = 'sold';
    setSarees(updatedSarees);

    // Add to sales log
    const newSale = {
      id: Date.now().toString(),
      sareeCode: codeToScan,
      name: updatedSarees[sareeIndex].name,
      price: updatedSarees[sareeIndex].price,
      saleDate: new Date().toLocaleString()
    };
    setSales([newSale, ...sales]);

    showNotification(`Success! ${codeToScan} marked as sold.`, 'success');
    return true;
  };

  const handleManualScan = (e) => {
    e.preventDefault();
    const code = e.target.scanCode.value.trim().toUpperCase();
    if (processSale(code)) {
      e.target.reset();
    }
  };

  // 4. Export to CSV Logic
  const exportToCSV = (data, filename) => {
    if (data.length === 0) {
      showNotification('No data available to export!', 'error');
      return;
    }

    // Get headers
    const headers = Object.keys(data[0]).join(',');
    
    // Get rows (wrap in quotes to handle commas in names)
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

  // --- UI COMPONENTS ---

  const DashboardView = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Exhibition Dashboard</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-100 p-4 rounded-xl shadow-sm">
          <p className="text-blue-800 text-sm font-semibold">Available Inventory</p>
          <p className="text-3xl font-bold text-blue-900">{sarees.filter(s => s.status === 'available').length}</p>
        </div>
        <div className="bg-green-100 p-4 rounded-xl shadow-sm">
          <p className="text-green-800 text-sm font-semibold">Items Sold</p>
          <p className="text-3xl font-bold text-green-900">{sales.length}</p>
        </div>
        <div className="bg-purple-100 p-4 rounded-xl shadow-sm col-span-2">
          <p className="text-purple-800 text-sm font-semibold">Total Revenue</p>
          <p className="text-3xl font-bold text-purple-900">
            ₹{sales.reduce((sum, sale) => sum + sale.price, 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Download size={18} className="text-blue-600" /> End of Day Backup
        </h3>
        <p className="text-sm text-gray-600 mb-4">Export your offline data to an Excel-compatible CSV file to backup to your main computer.</p>
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(sales, 'Sales_Log')} className="flex-1 bg-green-50 text-green-700 border border-green-200 font-semibold py-2 rounded-lg hover:bg-green-100 transition-colors text-sm">
            Export Sales
          </button>
          <button onClick={() => exportToCSV(sarees, 'Inventory_Master')} className="flex-1 bg-blue-50 text-blue-700 border border-blue-200 font-semibold py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm">
            Export Inventory
          </button>
        </div>
      </div>
    </div>
  );

  const AddInventoryView = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Add New Saree</h2>
      <form onSubmit={handleAddSaree} className="space-y-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Saree Name / Design</label>
          <input required name="name" type="text" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Red Floral Silk" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Material / Type</label>
          <select required name="type" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="Paithani">Paithani</option>
            <option value="Cotton">Cotton</option>
            <option value="Banarasi">Banarasi</option>
            <option value="Kanjeevaram">Kanjeevaram</option>
            <option value="Chiffon">Chiffon</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
          <input required name="price" type="number" min="0" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00" />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors flex justify-center items-center gap-2">
          <PlusCircle size={20} /> Add to Inventory
        </button>
      </form>
    </div>
  );

  const InventoryListView = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Current Inventory</h2>
      {sarees.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No sarees in inventory yet.</p>
      ) : (
        <div className="space-y-3">
          {sarees.map((saree) => (
            <div key={saree.id} className={`p-4 rounded-xl border ${saree.status === 'sold' ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-100 shadow-sm'} flex justify-between items-center`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm font-bold">{saree.code}</span>
                  {saree.status === 'sold' && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold">SOLD</span>}
                </div>
                <h3 className={`font-bold mt-1 ${saree.status === 'sold' ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{saree.name}</h3>
                <p className="text-sm text-gray-600">{saree.type} • ₹{saree.price}</p>
              </div>
              
              {saree.status === 'available' && (
                <div className="flex flex-col items-center justify-center p-2 bg-gray-50 rounded border border-dashed border-gray-300">
                   <div className="w-10 h-10 bg-black grid grid-cols-3 gap-0.5 p-0.5 mb-1">
                      <div className="bg-white"></div><div className="bg-black"></div><div className="bg-white"></div>
                      <div className="bg-black"></div><div className="bg-white"></div><div className="bg-white"></div>
                      <div className="bg-white"></div><div className="bg-white"></div><div className="bg-black"></div>
                   </div>
                   <span className="text-[10px] text-gray-500">Label QR</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const PointOfSaleView = () => {
    const [isCameraActive, setIsCameraActive] = useState(false);
    const scannerRef = useRef(null);

    // Cleanup scanner when component unmounts or switches mode
    useEffect(() => {
      return () => {
        if (scannerRef.current) {
          scannerRef.current.stop().catch(console.error);
        }
      };
    }, []);

    const startCameraScanner = () => {
      if (!window.Html5Qrcode) {
        showNotification("Scanner library loading, please try again in a moment.", "error");
        return;
      }
      setIsCameraActive(true);
      
      setTimeout(() => {
        const html5QrCode = new window.Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        
        html5QrCode.start(
          { facingMode: "environment" }, // Prioritize back camera
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Success! We found a code.
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log('Audio blocked'));
            
            processSale(decodedText);
            stopCameraScanner();
          },
          (errorMessage) => {
            // Background scanning, ignore errors until it finds something
          }
        ).catch(err => {
          console.error("Camera Error:", err);
          showNotification("Could not access camera. Check permissions.", "error");
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

    return (
      <div className="space-y-4 h-full">
        <div className={`bg-gray-900 rounded-xl p-6 text-center text-white shadow-lg transition-all ${isCameraActive ? 'h-full flex flex-col' : ''}`}>
          
          {!isCameraActive ? (
            <>
              <ScanLine size={64} className="mx-auto text-blue-400 mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2">Checkout Scanner</h2>
              <p className="text-gray-400 text-sm mb-6">Use your phone's camera or a USB barcode scanner.</p>
              
              <button 
                onClick={startCameraScanner}
                className="w-full bg-blue-600 hover:bg-blue-500 font-bold px-6 py-4 rounded-lg transition-colors flex justify-center items-center gap-2 mb-6"
              >
                <Camera size={24} /> USE CAMERA SCANNER
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="h-px bg-gray-700 flex-1"></div>
                <span className="text-xs text-gray-500 font-bold uppercase">Or Manual Entry</span>
                <div className="h-px bg-gray-700 flex-1"></div>
              </div>

              <form onSubmit={handleManualScan} className="flex gap-2">
                <input 
                  autoFocus
                  required
                  name="scanCode" 
                  type="text" 
                  placeholder="e.g. SAR-COT-1234" 
                  className="flex-1 p-3 rounded-lg text-black font-mono uppercase focus:outline-none focus:ring-4 focus:ring-blue-500"
                />
                <button type="submit" className="bg-gray-700 hover:bg-gray-600 font-bold px-6 py-3 rounded-lg transition-colors border border-gray-600">
                  SELL
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center">
              <div className="flex justify-between items-center w-full mb-4">
                <h3 className="font-bold">Point Camera at QR Code</h3>
                <button onClick={stopCameraScanner} className="bg-red-500/20 text-red-400 p-2 rounded-full hover:bg-red-500/40">
                  <X size={20} />
                </button>
              </div>
              {/* Scanner Video gets injected here */}
              <div id="reader" className="w-full bg-black rounded-lg overflow-hidden border-2 border-dashed border-gray-600 min-h-[300px]"></div>
              <p className="text-xs text-gray-400 mt-4 animate-pulse">Scanning...</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const SalesLogView = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Sales Log</h2>
      {sales.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No sales recorded yet.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {sales.map((sale) => (
              <div key={sale.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p className="font-bold text-gray-800">{sale.name}</p>
                  <p className="text-sm text-gray-500 font-mono">{sale.sareeCode}</p>
                  <p className="text-xs text-gray-400 mt-1">{sale.saleDate}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">₹{sale.price}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 justify-end">
                    <CheckCircle2 size={12} className="text-green-500" /> Paid
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
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header */}
      <div className="bg-blue-900 text-white p-4 pt-6 shadow-md z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tag size={24} className="text-blue-300" />
            SareeOffline PoS
          </h1>
          <p className="text-blue-300 text-xs mt-1">Local Exhibition Mode (Offline)</p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`absolute top-20 left-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-bounce ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {notification.type === 'error' ? <AlertCircle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
          <p className="font-bold text-sm">{notification.message}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'add' && <AddInventoryView />}
        {activeTab === 'inventory' && <InventoryListView />}
        {activeTab === 'scan' && <PointOfSaleView />}
        {activeTab === 'log' && <SalesLogView />}
      </div>

      {/* Bottom Navigation */}
      <div className="bg-white border-t border-gray-200 flex justify-around p-2 absolute bottom-0 w-full z-10 pb-6 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <NavButton icon={<LayoutDashboard />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <NavButton icon={<PlusCircle />} label="Add" active={activeTab === 'add'} onClick={() => setActiveTab('add')} />
        <NavButton icon={<ScanLine />} label="Scan" active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} highlight />
        <NavButton icon={<Package />} label="Stock" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <NavButton icon={<ListOrdered />} label="Sales" active={activeTab === 'log'} onClick={() => setActiveTab('log')} />
      </div>
    </div>
  );
}

// Helper component for bottom navigation
const NavButton = ({ icon, label, active, onClick, highlight }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-all
      ${highlight 
        ? 'bg-blue-600 text-white -mt-6 shadow-xl h-16 w-16 border-4 border-gray-50' 
        : active ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
      }`}
  >
    {React.cloneElement(icon, { size: highlight ? 28 : 22 })}
    <span className={`text-[10px] mt-1 font-semibold ${highlight ? 'hidden' : 'block'}`}>{label}</span>
  </button>
);