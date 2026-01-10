import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import AnimatedModal from '../AnimatedModal';

export default function AddTrainerModal({ isOpen, onClose, firebaseUser, userName }) {
  const [trainerEmail, setTrainerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentTrainer, setCurrentTrainer] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);

  // Завантажити поточний стан
  useEffect(() => {
    if (!isOpen || !firebaseUser) return;

    const loadCurrentState = async () => {
      try {
        // Перевірити чи є вже тренер
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.trainerId) {
            // Завантажити дані тренера
            const trainerDoc = await getDoc(doc(db, 'trainers', data.trainerId));
            if (trainerDoc.exists()) {
              setCurrentTrainer({
                id: data.trainerId,
                email: data.trainerEmail,
                ...trainerDoc.data().profile
              });
            }
          }
        }

        // Перевірити чи є pending запити
        const requestsQuery = query(
          collection(db, 'trainerRequests'),
          where('clientId', '==', firebaseUser.uid),
          where('status', '==', 'pending')
        );
        const requestsSnapshot = await getDocs(requestsQuery);
        if (!requestsSnapshot.empty) {
          const req = requestsSnapshot.docs[0];
          setPendingRequest({ id: req.id, ...req.data() });
        }
      } catch (err) {
        console.error('Error loading trainer state:', err);
      }
    };

    loadCurrentState();
  }, [isOpen, firebaseUser]);

  // Надіслати запит тренеру
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!trainerEmail.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Перевірити чи існує такий email
      const email = trainerEmail.trim().toLowerCase();

      // Створити запит
      const requestRef = doc(collection(db, 'trainerRequests'));
      await setDoc(requestRef, {
        clientId: firebaseUser.uid,
        clientEmail: firebaseUser.email,
        clientName: userName || firebaseUser.displayName || 'Клієнт',
        trainerEmail: email,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      setPendingRequest({
        id: requestRef.id,
        trainerEmail: email,
        status: 'pending'
      });

      setSuccess('Запит надіслано! Очікуйте підтвердження від тренера.');
      setTrainerEmail('');
    } catch (err) {
      console.error('Error sending request:', err);
      setError('Помилка надсилання запиту. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  // Скасувати запит
  const handleCancelRequest = async () => {
    if (!pendingRequest) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'trainerRequests', pendingRequest.id));
      setPendingRequest(null);
      setSuccess('Запит скасовано');
    } catch (err) {
      console.error('Error canceling request:', err);
      setError('Помилка скасування запиту');
    } finally {
      setLoading(false);
    }
  };

  // Відключитися від тренера
  const handleDisconnect = async () => {
    if (!currentTrainer || !firebaseUser) return;

    setLoading(true);
    try {
      // Видалити клієнта зі списку тренера
      const trainerRef = doc(db, 'trainers', currentTrainer.id);
      const trainerDoc = await getDoc(trainerRef);
      if (trainerDoc.exists()) {
        const clients = trainerDoc.data().clients || {};
        delete clients[firebaseUser.uid];
        await updateDoc(trainerRef, { clients });
      }

      // Очистити trainerId в профілі клієнта
      const userRef = doc(db, 'users', firebaseUser.uid);
      await updateDoc(userRef, {
        trainerId: null,
        trainerEmail: null
      });

      setCurrentTrainer(null);
      setSuccess('Ви відключились від тренера');
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Помилка відключення');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTrainerEmail('');
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <UserPlus size={20} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Мій тренер</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Current Trainer */}
        {currentTrainer && (
          <div className="bg-green-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
                  <Check size={20} className="text-green-700" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">
                    {currentTrainer.name || 'Тренер'}
                  </div>
                  <div className="text-sm text-gray-600">{currentTrainer.email}</div>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Відключитись"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <p className="text-sm text-green-700 mt-3">
              Тренер бачить ваше харчування в реальному часі
            </p>
          </div>
        )}

        {/* Pending Request */}
        {pendingRequest && !currentTrainer && (
          <div className="bg-yellow-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-200 rounded-full flex items-center justify-center">
                  <Clock size={20} className="text-yellow-700" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Очікує підтвердження</div>
                  <div className="text-sm text-gray-600">{pendingRequest.trainerEmail}</div>
                </div>
              </div>
              <button
                onClick={handleCancelRequest}
                disabled={loading}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Скасувати"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-yellow-700 mt-3">
              Запит надіслано. Тренер має підтвердити його у своєму дашборді.
            </p>
          </div>
        )}

        {/* Add Trainer Form */}
        {!currentTrainer && !pendingRequest && (
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-gray-600 mb-4">
              Введіть email вашого тренера, щоб він міг переглядати ваше харчування в реальному часі.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email тренера
              </label>
              <input
                type="email"
                value={trainerEmail}
                onChange={(e) => setTrainerEmail(e.target.value)}
                placeholder="trainer@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-green-600 text-sm mb-4">
                <Check size={16} />
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !trainerEmail.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Надсилаємо...' : 'Надіслати запит'}
            </button>
          </form>
        )}

        {/* Info */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-500">
            Після підтвердження тренером, він зможе бачити:
          </p>
          <ul className="text-xs text-gray-500 mt-2 space-y-1">
            <li>• Ваші прийоми їжі в реальному часі</li>
            <li>• Історію харчування за всі дні</li>
            <li>• Активність та прогрес по БЖВ</li>
          </ul>
        </div>
      </div>
    </AnimatedModal>
  );
}
