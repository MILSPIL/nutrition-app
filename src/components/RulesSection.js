import React from 'react';

export default function RulesSection() {
  return (
    <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: '#364f3a' }}>ℹ️ Важливі правила</h2>
      <div className="text-sm space-y-2" style={{ color: '#364f3a' }}>
        <p className="font-medium">З кожної літери виберіть щось одне (можна їсти два продукти по 50% кожен).</p>

        <p className="mt-3">✅ <strong>Соєвий соус і спеції</strong> можна.</p>

        <div className="mt-3">
          <p className="font-medium mb-2">Можна проводити будь-які ротації:</p>
          <ul className="space-y-1 ml-4">
            <li>✅ Міняти прийоми їжі місцями (перший прийом можна спожити ввечері)</li>
            <li>✅ Зменшувати/збільшувати кількість прийомів їжі (4 прийоми їжі можна об'єднати в 3)</li>
            <li>✅ Брати продукт з одного прийому їжі і переставляти в інший (наприклад літеру «а» перенести в 4 прийом)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
