import React from 'react';
import ClientCard from './ClientCard';

export default function ClientList({ clients, clientMeals, onClientClick }) {
  // Сортуємо клієнтів: спочатку ті, хто сьогодні активний
  const sortedClients = [...clients].sort((a, b) => {
    const aMeals = clientMeals[a.id];
    const bMeals = clientMeals[b.id];

    // Ті хто має дані сьогодні - вперед
    if (aMeals && !bMeals) return -1;
    if (!aMeals && bMeals) return 1;

    // Потім по імені
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="space-y-3">
      {sortedClients.map(client => (
        <ClientCard
          key={client.id}
          client={client}
          todayMeals={clientMeals[client.id]}
          onClick={() => onClientClick(client)}
        />
      ))}
    </div>
  );
}
