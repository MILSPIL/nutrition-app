import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { LogOut, Users, ChevronLeft, Calendar, RefreshCw, Plus, ChevronDown } from 'lucide-react';
import { LoadingScreen, ToastProvider, toast } from '../components';
import ClientList from '../components/trainer/ClientList';
import ClientDetailsModal from '../components/trainer/ClientDetailsModal';
import PendingRequests from '../components/trainer/PendingRequests';

export default function TrainerDashboard() {
  const navigate = useNavigate();
  const { clientId } = useParams();

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trainerData, setTrainerData] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientMeals, setClientMeals] = useState({});
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadTrainerData(user.uid);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Завантажити дані тренера
  const loadTrainerData = async (trainerId) => {
    try {
      const trainerRef = doc(db, 'trainers', trainerId);
      const trainerDoc = await getDoc(trainerRef);

      if (trainerDoc.exists()) {
        const data = trainerDoc.data();
        setTrainerData(data);

        // Завантажити клієнтів
        const clientsList = Object.entries(data.clients || {}).map(([id, clientData]) => ({
          id,
          ...clientData
        }));
        setClients(clientsList);

        // Завантажити сьогоднішні дані для кожного клієнта
        loadClientsToday(clientsList);
      } else {
        // Новий тренер - створити профіль
        await setDoc(trainerRef, {
          profile: {
            name: auth.currentUser?.displayName || 'Тренер',
            email: auth.currentUser?.email,
            createdAt: new Date().toISOString()
          },
          clients: {}
        });
        setTrainerData({ profile: {}, clients: {} });
        setClients([]);
      }
    } catch (error) {
      console.error('Error loading trainer data:', error);
      toast.error('Помилка завантаження даних');
    }
  };

  // Форматування дати
  const formatDate = (date) => date.toISOString().split('T')[0];

  // Завантажити дані клієнтів за обрану дату
  const loadClientsMeals = async (clientsList, date) => {
    const dateStr = formatDate(date);
    const mealsData = {};

    for (const client of clientsList) {
      try {
        const historyRef = doc(db, 'users', client.id, 'mealHistory', dateStr);
        const historyDoc = await getDoc(historyRef);

        if (historyDoc.exists()) {
          mealsData[client.id] = historyDoc.data();
        } else {
          mealsData[client.id] = null;
        }
      } catch (error) {
        console.error(`Error loading client ${client.id} meals:`, error);
        mealsData[client.id] = null;
      }
    }

    setClientMeals(mealsData);
  };

  // Alias для сумісності
  const loadClientsToday = (clientsList) => loadClientsMeals(clientsList, selectedDate);

  // Завантажити дані при зміні дати
  useEffect(() => {
    if (clients.length > 0) {
      loadClientsMeals(clients, selectedDate);
    }
  }, [selectedDate]);

  // Обробка вибору дати з input[type=date]
  const handleDateChange = (e) => {
    const newDate = new Date(e.target.value + 'T12:00:00');
    setSelectedDate(newDate);
    setShowDatePicker(false);
  };

  // Real-time оновлення для клієнтів (тільки для сьогодні)
  useEffect(() => {
    if (clients.length === 0) return;

    const today = new Date();
    const isToday = formatDate(selectedDate) === formatDate(today);

    // Real-time тільки для сьогоднішньої дати
    if (!isToday) return;

    const dateStr = formatDate(selectedDate);
    const unsubscribes = [];

    clients.forEach(client => {
      const historyRef = doc(db, 'users', client.id, 'mealHistory', dateStr);
      const unsub = onSnapshot(historyRef, (docSnap) => {
        setClientMeals(prev => ({
          ...prev,
          [client.id]: docSnap.exists() ? docSnap.data() : null
        }));
      }, (error) => {
        console.error(`Error listening to client ${client.id}:`, error);
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [clients, selectedDate]);

  // Google Sign In
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in:', error);
      toast.error('Помилка входу');
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Відкрити деталі клієнта
  const handleClientClick = (client) => {
    setSelectedClient(client);
    setShowClientDetails(true);
  };

  // Оновити дані
  const handleRefresh = () => {
    if (clients.length > 0) {
      loadClientsToday(clients);
      toast.success('Дані оновлено');
    }
  };

  // Створити тестового клієнта (для розробки)
  const createTestClient = async () => {
    if (!firebaseUser) return;

    const testClientId = 'test-client-' + Date.now();
    const testMeasurements = [
      { date: '2024-11-15', weight: 85.0, waist: 92, hips: 108, chest: 100, arms: 34, thighs: 62 },
      { date: '2024-11-22', weight: 84.2, waist: 91, hips: 107, chest: 99, arms: 33.5, thighs: 61 },
      { date: '2024-12-06', weight: 82.8, waist: 88, hips: 105, chest: 98, arms: 32.5, thighs: 59 },
      { date: '2024-12-20', weight: 80.2, waist: 84, hips: 102, chest: 96, arms: 31.5, thighs: 57 },
      { date: '2025-01-03', weight: 79.0, waist: 82, hips: 100, chest: 95, arms: 31, thighs: 56 },
      { date: '2025-01-10', weight: 78.5, waist: 80, hips: 99, chest: 94, arms: 30.5, thighs: 55 },
    ];

    try {
      // 1. Створити профіль клієнта
      const userRef = doc(db, 'users', testClientId);
      await setDoc(userRef, {
        users: {
          [testClientId]: {
            name: 'Тестова Клієнтка',
            gender: 'жінка',
            portions: {},
            programDay: 57,
            currentWeight: 78.5,
            meals: { 1: {}, 2: {}, 3: {}, 4: {} },
            startDate: '2024-11-15',
            createdAt: new Date().toISOString()
          }
        },
        trainerId: firebaseUser.uid,
        trainerEmail: firebaseUser.email,
        globalCustomProducts: {},
        createdAt: new Date().toISOString()
      });

      // 2. Додати заміри
      for (const m of testMeasurements) {
        const measurementRef = doc(db, 'users', testClientId, 'measurements', m.date);
        await setDoc(measurementRef, {
          ...m,
          timestamp: new Date(m.date + 'T10:00:00Z').toISOString()
        });
      }

      // 3. Додати сьогоднішню історію харчування
      const today = new Date().toISOString().split('T')[0];
      const mealHistoryRef = doc(db, 'users', testClientId, 'mealHistory', today);
      await setDoc(mealHistoryRef, {
        meals: {
          1: { 'Б': [{ name: 'Яйця', weight: 120, portion: 100, p: 13, f: 11, c: 1 }] },
          2: { 'Б': [{ name: 'Куряча грудка', weight: 150, portion: 100, p: 31, f: 4, c: 0 }] },
          3: { 'Б': [{ name: 'Лосось', weight: 120, portion: 100, p: 20, f: 13, c: 0 }] },
          4: { 'Е': [{ name: 'Сир', weight: 150, portion: 100, p: 18, f: 5, c: 2 }] }
        },
        currentWeight: 78.5,
        programDay: 57,
        totalMacros: { p: 98, f: 42, c: 45, cal: 950 },
        updatedAt: new Date().toISOString()
      });

      // 4. Додати клієнта до списку тренера
      const trainerRef = doc(db, 'trainers', firebaseUser.uid);
      const trainerDoc = await getDoc(trainerRef);
      const trainerData = trainerDoc.data();

      await setDoc(trainerRef, {
        ...trainerData,
        clients: {
          ...trainerData.clients,
          [testClientId]: {
            name: 'Тестова Клієнтка',
            email: 'test@example.com',
            addedAt: new Date().toISOString()
          }
        }
      }, { merge: true });

      // Оновити локальний стан
      const newClient = {
        id: testClientId,
        name: 'Тестова Клієнтка',
        email: 'test@example.com'
      };
      setClients(prev => [...prev, newClient]);
      loadClientsToday([...clients, newClient]);

      toast.success('Тестовий клієнт створений!');
    } catch (error) {
      console.error('Error creating test client:', error);
      toast.error('Помилка створення тестового клієнта');
    }
  };

  // Loading
  if (loading) {
    return <LoadingScreen />;
  }

  // Login screen for trainer
  if (!firebaseUser) {
    return (
      <ToastProvider>
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#f2f0eb' }}>
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={40} className="text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Тренерський дашборд</h1>
            <p className="text-gray-600 mb-6">
              Увійдіть через Google, щоб переглядати харчування ваших клієнтів у реальному часі
            </p>
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Увійти через Google
            </button>
            <button
              onClick={() => navigate('/')}
              className="mt-4 text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Назад до додатку
            </button>
          </div>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen" style={{ fontFamily: 'Montserrat', backgroundColor: '#f2f0eb' }}>
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft size={24} />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">Тренерський дашборд</h1>
                  <p className="text-sm text-gray-500">{firebaseUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={createTestClient}
                  className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  title="Додати тестового клієнта"
                >
                  <Plus size={20} />
                </button>
                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Оновити"
                >
                  <RefreshCw size={20} />
                </button>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Вийти"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto p-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-blue-600">{clients.length}</div>
              <div className="text-sm text-gray-500">Клієнтів</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(clientMeals).filter(m => m?.totalMacros?.p >= 100).length}
              </div>
              <div className="text-sm text-gray-500">Виконали норму</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-orange-600">
                {Object.values(clientMeals).filter(m => m && m?.totalMacros?.p < 100).length}
              </div>
              <div className="text-sm text-gray-500">В процесі</div>
            </div>
          </div>

          {/* Date Picker */}
          <div className="mb-4 relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Calendar size={18} />
              <span className="font-medium">
                {formatDate(selectedDate) === formatDate(new Date())
                  ? 'Сьогодні'
                  : selectedDate.toLocaleDateString('uk-UA', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })
                }
              </span>
              <ChevronDown size={16} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>

            {showDatePicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDatePicker(false)}
                />
                <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-xl shadow-lg p-3 border">
                  <input
                    type="date"
                    value={formatDate(selectedDate)}
                    onChange={handleDateChange}
                    max={formatDate(new Date())}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      setSelectedDate(new Date());
                      setShowDatePicker(false);
                    }}
                    className="w-full mt-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                  >
                    Сьогодні
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Pending Requests */}
          <PendingRequests
            trainerEmail={firebaseUser.email}
            trainerId={firebaseUser.uid}
            onClientAdded={(newClient) => {
              setClients(prev => [...prev, newClient]);
              loadClientsToday([...clients, newClient]);
              toast.success(`${newClient.name} доданий до ваших клієнтів!`);
            }}
          />

          {/* Client List */}
          {clients.length > 0 ? (
            <ClientList
              clients={clients}
              clientMeals={clientMeals}
              onClientClick={handleClientClick}
            />
          ) : (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Ще немає клієнтів</h3>
              <p className="text-gray-500 text-sm mb-4">
                Клієнти можуть додати вас як тренера, вказавши вашу email адресу:
              </p>
              <div className="bg-gray-100 rounded-lg px-4 py-2 inline-block">
                <code className="text-blue-600">{firebaseUser.email}</code>
              </div>
            </div>
          )}
        </div>

        {/* Client Details Modal */}
        {selectedClient && (
          <ClientDetailsModal
            isOpen={showClientDetails}
            onClose={() => {
              setShowClientDetails(false);
              setSelectedClient(null);
            }}
            client={selectedClient}
            todayMeals={clientMeals[selectedClient.id]}
          />
        )}
      </div>
    </ToastProvider>
  );
}
