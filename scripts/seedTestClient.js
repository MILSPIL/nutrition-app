/**
 * Скрипт для створення тестового клієнта з замірами
 * Запуск: node scripts/seedTestClient.js
 *
 * Потрібен firebase-admin для роботи з Firestore з сервера
 */

const admin = require('firebase-admin');

// Ініціалізація Firebase Admin
// Потрібно завантажити service account key з Firebase Console
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Конфігурація тестового клієнта
const TEST_CLIENT = {
  uid: 'test-client-001',
  name: 'Тестовий Клієнт',
  email: 'test@example.com',
  gender: 'жінка'
};

// Email тренера (ваш email)
const TRAINER_EMAIL = 'yurrrey@gmail.com';

// Тестові заміри (симулюємо прогрес за 2 місяці)
const TEST_MEASUREMENTS = [
  {
    date: '2024-11-15',
    weight: 85.0,
    waist: 92,
    hips: 108,
    chest: 100,
    arms: 34,
    thighs: 62
  },
  {
    date: '2024-11-22',
    weight: 84.2,
    waist: 91,
    hips: 107,
    chest: 99,
    arms: 33.5,
    thighs: 61
  },
  {
    date: '2024-11-29',
    weight: 83.5,
    waist: 90,
    hips: 106,
    chest: 99,
    arms: 33,
    thighs: 60
  },
  {
    date: '2024-12-06',
    weight: 82.8,
    waist: 88,
    hips: 105,
    chest: 98,
    arms: 32.5,
    thighs: 59
  },
  {
    date: '2024-12-13',
    weight: 81.5,
    waist: 86,
    hips: 104,
    chest: 97,
    arms: 32,
    thighs: 58
  },
  {
    date: '2024-12-20',
    weight: 80.2,
    waist: 84,
    hips: 102,
    chest: 96,
    arms: 31.5,
    thighs: 57
  },
  {
    date: '2025-01-03',
    weight: 79.0,
    waist: 82,
    hips: 100,
    chest: 95,
    arms: 31,
    thighs: 56
  },
  {
    date: '2025-01-10',
    weight: 78.5,
    waist: 80,
    hips: 99,
    chest: 94,
    arms: 30.5,
    thighs: 55
  }
];

// Тестова історія харчування за сьогодні
const TODAY_MEALS = {
  meals: {
    1: {
      'Б': [{ name: 'Яйця', weight: 120, portion: 100, p: 13, f: 11, c: 1 }],
      'В': [{ name: 'Хліб', weight: 50, portion: 100, p: 9, f: 3, c: 49 }]
    },
    2: {
      'Б': [{ name: 'Куряча грудка', weight: 150, portion: 100, p: 31, f: 4, c: 0 }],
      'Г': [{ name: 'Рис', weight: 80, portion: 100, p: 7, f: 1, c: 79 }],
      'Д': [{ name: 'Огірок', weight: 100, portion: 100, p: 1, f: 0, c: 4 }]
    },
    3: {
      'Б': [{ name: 'Лосось', weight: 120, portion: 100, p: 20, f: 13, c: 0 }],
      'Г': [{ name: 'Гречка', weight: 70, portion: 100, p: 13, f: 3, c: 68 }]
    },
    4: {
      'Е': [{ name: 'Сир кисломолочний', weight: 150, portion: 100, p: 18, f: 5, c: 2 }]
    }
  },
  activity: 'Силова',
  otherActivity: '',
  currentWeight: 78.5,
  programDay: 57,
  totalMacros: { p: 98, f: 42, c: 145, cal: 1350 },
  updatedAt: new Date().toISOString()
};

async function seedTestClient() {
  console.log('🚀 Створюємо тестового клієнта...\n');

  try {
    // 1. Знайти тренера за email
    console.log(`📧 Шукаємо тренера: ${TRAINER_EMAIL}`);

    const trainersSnapshot = await db.collection('trainers').get();
    let trainerId = null;

    trainersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.profile?.email === TRAINER_EMAIL) {
        trainerId = doc.id;
      }
    });

    if (!trainerId) {
      console.log('❌ Тренера не знайдено. Спочатку увійдіть у тренерський дашборд.');
      process.exit(1);
    }

    console.log(`✅ Тренер знайдений: ${trainerId}\n`);

    // 2. Створити профіль тестового клієнта
    console.log('👤 Створюємо профіль клієнта...');

    const userRef = db.collection('users').doc(TEST_CLIENT.uid);
    await userRef.set({
      users: {
        [TEST_CLIENT.uid]: {
          name: TEST_CLIENT.name,
          gender: TEST_CLIENT.gender,
          portions: {},
          programDay: 57,
          currentWeight: 78.5,
          meals: { 1: {}, 2: {}, 3: {}, 4: {} },
          activity: '',
          otherActivity: '',
          startDate: '2024-11-15',
          createdAt: new Date().toISOString()
        }
      },
      trainerId: trainerId,
      trainerEmail: TRAINER_EMAIL,
      globalCustomProducts: {},
      createdAt: new Date().toISOString()
    });

    console.log('✅ Профіль клієнта створено\n');

    // 3. Додати заміри
    console.log('📏 Додаємо заміри...');

    for (const measurement of TEST_MEASUREMENTS) {
      const measurementRef = db.collection('users').doc(TEST_CLIENT.uid)
        .collection('measurements').doc(measurement.date);

      await measurementRef.set({
        ...measurement,
        timestamp: new Date(measurement.date + 'T10:00:00Z').toISOString()
      });

      console.log(`   ✓ ${measurement.date}: ${measurement.weight} кг`);
    }

    console.log('✅ Заміри додано\n');

    // 4. Додати сьогоднішню історію харчування
    console.log('🍽️ Додаємо історію харчування...');

    const today = new Date().toISOString().split('T')[0];
    const mealHistoryRef = db.collection('users').doc(TEST_CLIENT.uid)
      .collection('mealHistory').doc(today);

    await mealHistoryRef.set(TODAY_MEALS);

    console.log(`✅ Історія за ${today} додана\n`);

    // 5. Додати клієнта до списку тренера
    console.log('🔗 Додаємо клієнта до тренера...');

    const trainerRef = db.collection('trainers').doc(trainerId);
    const trainerDoc = await trainerRef.get();
    const trainerData = trainerDoc.data();

    await trainerRef.update({
      clients: {
        ...trainerData.clients,
        [TEST_CLIENT.uid]: {
          name: TEST_CLIENT.name,
          email: TEST_CLIENT.email,
          addedAt: new Date().toISOString()
        }
      }
    });

    console.log('✅ Клієнт доданий до тренера\n');

    console.log('🎉 Готово! Тестовий клієнт успішно створений.');
    console.log('\n📊 Дані клієнта:');
    console.log(`   Ім'я: ${TEST_CLIENT.name}`);
    console.log(`   Email: ${TEST_CLIENT.email}`);
    console.log(`   Замірів: ${TEST_MEASUREMENTS.length}`);
    console.log(`   Прогрес ваги: ${TEST_MEASUREMENTS[0].weight} → ${TEST_MEASUREMENTS[TEST_MEASUREMENTS.length - 1].weight} кг`);
    console.log(`   Прогрес талії: ${TEST_MEASUREMENTS[0].waist} → ${TEST_MEASUREMENTS[TEST_MEASUREMENTS.length - 1].waist} см`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

seedTestClient();
