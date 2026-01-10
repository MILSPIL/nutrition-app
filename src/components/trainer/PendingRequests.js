import React, { useState, useEffect } from 'react';
import { UserPlus, Check, X, Clock } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function PendingRequests({ trainerEmail, trainerId, onClientAdded }) {
  const [requests, setRequests] = useState([]);
  const [processing, setProcessing] = useState({});

  // Слухати запити в реальному часі
  useEffect(() => {
    if (!trainerEmail) return;

    const requestsQuery = query(
      collection(db, 'trainerRequests'),
      where('trainerEmail', '==', trainerEmail.toLowerCase()),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(requestsQuery, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRequests(reqs);
    }, (error) => {
      console.error('Error listening to requests:', error);
    });

    return () => unsubscribe();
  }, [trainerEmail]);

  // Прийняти запит
  const handleAccept = async (request) => {
    setProcessing(prev => ({ ...prev, [request.id]: 'accepting' }));

    try {
      // Додати клієнта до списку тренера
      const trainerRef = doc(db, 'trainers', trainerId);
      const trainerDoc = await getDoc(trainerRef);
      const currentClients = trainerDoc.exists() ? (trainerDoc.data().clients || {}) : {};

      await setDoc(trainerRef, {
        clients: {
          ...currentClients,
          [request.clientId]: {
            name: request.clientName,
            email: request.clientEmail,
            addedAt: new Date().toISOString(),
            status: 'active'
          }
        }
      }, { merge: true });

      // Оновити профіль клієнта
      const userRef = doc(db, 'users', request.clientId);
      await updateDoc(userRef, {
        trainerId: trainerId,
        trainerEmail: trainerEmail
      });

      // Оновити статус запиту
      await updateDoc(doc(db, 'trainerRequests', request.id), {
        status: 'accepted',
        acceptedAt: new Date().toISOString()
      });

      // Видалити запит
      await deleteDoc(doc(db, 'trainerRequests', request.id));

      if (onClientAdded) {
        onClientAdded({
          id: request.clientId,
          name: request.clientName,
          email: request.clientEmail
        });
      }
    } catch (error) {
      console.error('Error accepting request:', error);
    } finally {
      setProcessing(prev => ({ ...prev, [request.id]: null }));
    }
  };

  // Відхилити запит
  const handleReject = async (request) => {
    setProcessing(prev => ({ ...prev, [request.id]: 'rejecting' }));

    try {
      await updateDoc(doc(db, 'trainerRequests', request.id), {
        status: 'rejected',
        rejectedAt: new Date().toISOString()
      });

      // Видалити запит
      await deleteDoc(doc(db, 'trainerRequests', request.id));
    } catch (error) {
      console.error('Error rejecting request:', error);
    } finally {
      setProcessing(prev => ({ ...prev, [request.id]: null }));
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="bg-yellow-50 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={20} className="text-yellow-600" />
        <h3 className="font-semibold text-gray-800">
          Нові запити ({requests.length})
        </h3>
      </div>

      <div className="space-y-3">
        {requests.map(request => (
          <div
            key={request.id}
            className="bg-white rounded-lg p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-gray-800">{request.clientName}</div>
              <div className="text-sm text-gray-500">{request.clientEmail}</div>
              <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                <Clock size={12} />
                {new Date(request.createdAt).toLocaleDateString('uk-UA')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {processing[request.id] ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              ) : (
                <>
                  <button
                    onClick={() => handleReject(request)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Відхилити"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={() => handleAccept(request)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Прийняти"
                  >
                    <Check size={20} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
