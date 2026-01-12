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
    <div className="bg-[#FF9500]/10 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={20} className="text-[#FF9500]" />
        <h3 className="text-[17px] font-semibold text-black">
          Нові запити ({requests.length})
        </h3>
      </div>

      <div className="space-y-2">
        {requests.map(request => (
          <div
            key={request.id}
            className="bg-white rounded-xl p-3 flex items-center justify-between"
          >
            <div>
              <div className="text-[15px] font-medium text-black">{request.clientName}</div>
              <div className="text-[13px] text-[#8E8E93]">{request.clientEmail}</div>
              <div className="flex items-center gap-1 text-[11px] text-[#C7C7CC] mt-1">
                <Clock size={12} />
                {new Date(request.createdAt).toLocaleDateString('uk-UA')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {processing[request.id] ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#007AFF]"></div>
              ) : (
                <>
                  <button
                    onClick={() => handleReject(request)}
                    className="w-10 h-10 flex items-center justify-center text-[#FF3B30] bg-[#FF3B30]/10 rounded-full active:opacity-60"
                    title="Відхилити"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={() => handleAccept(request)}
                    className="w-10 h-10 flex items-center justify-center text-[#34C759] bg-[#34C759]/10 rounded-full active:opacity-60"
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
