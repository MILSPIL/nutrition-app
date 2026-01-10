// База продуктів з БЖВ (p - білки, f - жири, c - вуглеводи) та калорійністю (cal) на 100г СИРОГО продукту

export const PRODUCTS_DB = {
  "а": { name: "Вуглеводи", calories: 180, products: [
      { name: "бобові", raw: 50, cooked: 50, coef: 1, verified: true, p: 10.5, f: 0.5, c: 27, cal: 155 },
      { name: "картопля", raw: 180, cooked: 180, coef: 1, verified: true, p: 2, f: 0.4, c: 16, cal: 76 },
      { name: "кукурудза свіжа", raw: 180, cooked: 180, coef: 1, verified: true, p: 3.3, f: 1.5, c: 19, cal: 103 },
      { name: "рис нешліфований", raw: 50, cooked: 170, coef: 3.4, verified: true, p: 7.5, f: 2.7, c: 73, cal: 346 },
      { name: "будь-яка крупа", raw: 50, cooked: 160, coef: 3.2, verified: true, p: 12, f: 3, c: 62, cal: 323 },
      { name: "цільнозернове борошно", raw: 50, cooked: 50, coef: 1, verified: true, p: 11, f: 2, c: 61, cal: 306 },
      { name: "хлібці", raw: 80, cooked: 80, coef: 1, verified: true, p: 10, f: 2.3, c: 70, cal: 341 },
      { name: "цільнозерновий хліб", raw: 85, cooked: 85, coef: 1, verified: true, p: 8.5, f: 2.5, c: 42, cal: 225 },
      { name: "макарони т.с.", raw: 50, cooked: 125, coef: 2.5, verified: true, p: 10.4, f: 1.1, c: 71, cal: 336 },
      { name: "лаваш", raw: 80, cooked: 80, coef: 1, verified: true, p: 8, f: 1, c: 56, cal: 265 },
    ]
  },
  "б": { name: "Молочні", calories: 95, products: [
      { name: "сир кисломолочний 0,2%", raw: 160, cooked: 160, coef: 1, verified: true, p: 18, f: 0.2, c: 1.5, cal: 80 },
      { name: "сири м'які/тверді/плавлені", raw: 30, cooked: 30, coef: 1, verified: true, p: 23, f: 24, c: 2, cal: 316 },
      { name: "сметана 15%", raw: 30, cooked: 30, coef: 1, verified: true, p: 2.6, f: 15, c: 3, cal: 157 },
      { name: "кефір 1%", raw: 270, cooked: 270, coef: 1, verified: true, p: 2.8, f: 1, c: 4, cal: 36 },
      { name: "йогурт несолодкий 1%", raw: 250, cooked: 250, coef: 1, verified: true, p: 3, f: 1, c: 4, cal: 37 },
      { name: "молоко 1%", raw: 280, cooked: 280, coef: 1, verified: true, p: 3, f: 1, c: 4.7, cal: 40 },
    ]
  },
  "в": { name: "Вільний вибір", calories: 575, products: [
      { name: "будь-що", raw: 115, cooked: 115, coef: 1, verified: true, p: 2, f: 10, c: 40, cal: 258 },
      { name: "фрукти", raw: 1150, cooked: 1150, coef: 1, verified: true, p: 1, f: 0.3, c: 12, cal: 55 },
      { name: "банани", raw: 690, cooked: 690, coef: 1, verified: true, p: 1.1, f: 0.3, c: 23, cal: 99 },
    ]
  },
  "г": { name: "Вуглеводи", calories: 180, products: [
      { name: "бобові", raw: 50, cooked: 50, coef: 1, verified: true, p: 10.5, f: 0.5, c: 27, cal: 155 },
      { name: "картопля", raw: 180, cooked: 180, coef: 1, verified: true, p: 2, f: 0.4, c: 16, cal: 76 },
      { name: "кукурудза свіжа", raw: 180, cooked: 180, coef: 1, verified: true, p: 3.3, f: 1.5, c: 19, cal: 103 },
      { name: "рис нешліфований", raw: 50, cooked: 170, coef: 3.4, verified: true, p: 7.5, f: 2.7, c: 73, cal: 346 },
      { name: "будь-яка крупа", raw: 50, cooked: 160, coef: 3.2, verified: true, p: 12, f: 3, c: 62, cal: 323 },
      { name: "цільнозернове борошно", raw: 50, cooked: 50, coef: 1, verified: true, p: 11, f: 2, c: 61, cal: 306 },
      { name: "хлібці", raw: 80, cooked: 80, coef: 1, verified: true, p: 10, f: 2.3, c: 70, cal: 341 },
      { name: "цільнозерновий хліб", raw: 85, cooked: 85, coef: 1, verified: true, p: 8.5, f: 2.5, c: 42, cal: 225 },
      { name: "макарони т.с.", raw: 50, cooked: 125, coef: 2.5, verified: true, p: 10.4, f: 1.1, c: 71, cal: 336 },
      { name: "лаваш", raw: 80, cooked: 80, coef: 1, verified: true, p: 8, f: 1, c: 56, cal: 265 },
    ]
  },
  "д": { name: "Білки", calories: 205, products: [
      { name: "телятина", raw: 160, cooked: 160, coef: 1, verified: true, p: 19.7, f: 1.2, c: 0, cal: 90 },
      { name: "печінка", raw: 160, cooked: 160, coef: 1, verified: true, p: 18.4, f: 3.1, c: 5.3, cal: 123 },
      { name: "куряче філе", raw: 190, cooked: 116, coef: 0.611, verified: true, p: 23.6, f: 1.9, c: 0.4, cal: 113 },
      { name: "індиче філе", raw: 190, cooked: 116, coef: 0.611, verified: true, p: 25.3, f: 1.6, c: 0, cal: 116 },
      { name: "риба до 5% жиру", raw: 190, cooked: 190, coef: 1, verified: true, p: 18.5, f: 3, c: 0, cal: 101 },
      { name: "риба від 5% жиру", raw: 130, cooked: 130, coef: 1, verified: true, p: 18, f: 8, c: 0, cal: 144 },
      { name: "3 яйця", raw: 150, cooked: 150, coef: 1, verified: true, p: 12.7, f: 10.9, c: 0.7, cal: 152 },
      { name: "морепродукти", raw: 225, cooked: 225, coef: 1, verified: true, p: 18, f: 1, c: 2, cal: 89 },
    ]
  },
  "е": { name: "Овочі", calories: 60, products: [
      { name: "овочі свіжі", raw: 300, cooked: 300, coef: 1, verified: true, p: 1.5, f: 0.2, c: 5, cal: 28 },
      { name: "овочі квашені", raw: 300, cooked: 300, coef: 1, verified: true, p: 1.8, f: 0.1, c: 4, cal: 24 },
      { name: "зелень", raw: 300, cooked: 300, coef: 1, verified: true, p: 2.6, f: 0.4, c: 5.4, cal: 36 },
      { name: "гриби", raw: 300, cooked: 180, coef: 0.6, verified: true, p: 3.1, f: 0.4, c: 3.3, cal: 30 },
    ]
  },
  "є": { name: "Жири", calories: 95, products: [
      { name: "олія лляна", raw: 12, cooked: 12, coef: 1, verified: true, p: 0, f: 100, c: 0, cal: 900 },
      { name: "будь-яка олія", raw: 12, cooked: 12, coef: 1, verified: true, p: 0, f: 100, c: 0, cal: 900 },
      { name: "авокадо", raw: 65, cooked: 65, coef: 1, verified: true, p: 2, f: 14.7, c: 8.5, cal: 174 },
      { name: "оливки", raw: 80, cooked: 80, coef: 1, verified: true, p: 0.8, f: 10.7, c: 6.3, cal: 125 },
      { name: "гірчиця", raw: 28, cooked: 28, coef: 1, verified: true, p: 5.7, f: 6, c: 10, cal: 117 },
      { name: "майонез", raw: 15, cooked: 15, coef: 1, verified: true, p: 2.4, f: 67, c: 3.9, cal: 628 },
      { name: "кетчуп", raw: 42, cooked: 42, coef: 1, verified: true, p: 1, f: 0.1, c: 22.2, cal: 94 },
      { name: "масло", raw: 15, cooked: 15, coef: 1, verified: true, p: 0.5, f: 82.5, c: 0.8, cal: 748 },
      { name: "сало", raw: 10, cooked: 10, coef: 1, verified: true, p: 2.4, f: 89, c: 0, cal: 811 },
    ]
  },
  "ж": { name: "Молочні", calories: 150, products: [
      { name: "сир кисломолочний 0,2% (ж)", raw: 215, cooked: 215, coef: 1, verified: true, p: 18, f: 0.2, c: 1.5, cal: 80 },
      { name: "сири м'які/тверді/плавлені (ж)", raw: 42, cooked: 42, coef: 1, verified: true, p: 23, f: 24, c: 2, cal: 316 },
      { name: "сметана 15% (ж)", raw: 85, cooked: 85, coef: 1, verified: true, p: 2.6, f: 15, c: 3, cal: 157 },
      { name: "кефір 1% (ж)", raw: 365, cooked: 365, coef: 1, verified: true, p: 2.8, f: 1, c: 4, cal: 36 },
      { name: "йогурт несолодкий 1% (ж)", raw: 400, cooked: 400, coef: 1, verified: true, p: 3, f: 1, c: 4, cal: 37 },
      { name: "молоко 1% (ж)", raw: 365, cooked: 365, coef: 1, verified: true, p: 3, f: 1, c: 4.7, cal: 40 },
    ]
  },
  "з": { name: "Фрукти", calories: 290, products: [
      { name: "фрукти та ягоди", raw: 400, cooked: 400, coef: 1, verified: true, p: 1, f: 0.3, c: 12, cal: 55 },
      { name: "банани/виноград/хурма", raw: 240, cooked: 240, coef: 1, verified: true, p: 1.1, f: 0.3, c: 23, cal: 99 },
    ]
  },
  "и": { name: "Горіхи", calories: 145, products: [
      { name: "грецькі горіхи", raw: 20, cooked: 20, coef: 1, verified: true, p: 15.2, f: 65.2, c: 7, cal: 676 },
      { name: "будь-які горіхи", raw: 20, cooked: 20, coef: 1, verified: true, p: 15, f: 60, c: 10, cal: 640 },
      { name: "насіння", raw: 20, cooked: 20, coef: 1, verified: true, p: 20, f: 50, c: 15, cal: 590 },
    ]
  },
  "і": { name: "Білки", calories: 205, products: [
      { name: "телятина", raw: 160, cooked: 160, coef: 1, verified: true, p: 19.7, f: 1.2, c: 0, cal: 90 },
      { name: "печінка", raw: 160, cooked: 160, coef: 1, verified: true, p: 18.4, f: 3.1, c: 5.3, cal: 123 },
      { name: "куряче філе", raw: 190, cooked: 116, coef: 0.611, verified: true, p: 23.6, f: 1.9, c: 0.4, cal: 113 },
      { name: "індиче філе", raw: 190, cooked: 116, coef: 0.611, verified: true, p: 25.3, f: 1.6, c: 0, cal: 116 },
      { name: "риба до 5% жиру", raw: 190, cooked: 190, coef: 1, verified: true, p: 18.5, f: 3, c: 0, cal: 101 },
      { name: "риба від 5% жиру", raw: 130, cooked: 130, coef: 1, verified: true, p: 18, f: 8, c: 0, cal: 144 },
      { name: "3 яйця", raw: 150, cooked: 150, coef: 1, verified: true, p: 12.7, f: 10.9, c: 0.7, cal: 152 },
      { name: "морепродукти", raw: 225, cooked: 225, coef: 1, verified: true, p: 18, f: 1, c: 2, cal: 89 },
    ]
  },
  "ї": { name: "Овочі", calories: 60, products: [
      { name: "овочі свіжі", raw: 300, cooked: 300, coef: 1, verified: true, p: 1.5, f: 0.2, c: 5, cal: 28 },
      { name: "овочі квашені", raw: 300, cooked: 300, coef: 1, verified: true, p: 1.8, f: 0.1, c: 4, cal: 24 },
      { name: "зелень", raw: 300, cooked: 300, coef: 1, verified: true, p: 2.6, f: 0.4, c: 5.4, cal: 36 },
      { name: "гриби", raw: 300, cooked: 180, coef: 0.6, verified: true, p: 3.1, f: 0.4, c: 3.3, cal: 30 },
    ]
  },
  "й": { name: "Жири", calories: 95, products: [
      { name: "олія лляна", raw: 12, cooked: 12, coef: 1, verified: true, p: 0, f: 100, c: 0, cal: 900 },
      { name: "будь-яка олія", raw: 12, cooked: 12, coef: 1, verified: true, p: 0, f: 100, c: 0, cal: 900 },
      { name: "авокадо", raw: 65, cooked: 65, coef: 1, verified: true, p: 2, f: 14.7, c: 8.5, cal: 174 },
      { name: "оливки", raw: 80, cooked: 80, coef: 1, verified: true, p: 0.8, f: 10.7, c: 6.3, cal: 125 },
      { name: "гірчиця", raw: 28, cooked: 28, coef: 1, verified: true, p: 5.7, f: 6, c: 10, cal: 117 },
      { name: "майонез", raw: 15, cooked: 15, coef: 1, verified: true, p: 2.4, f: 67, c: 3.9, cal: 628 },
      { name: "кетчуп", raw: 42, cooked: 42, coef: 1, verified: true, p: 1, f: 0.1, c: 22.2, cal: 94 },
      { name: "масло", raw: 15, cooked: 15, coef: 1, verified: true, p: 0.5, f: 82.5, c: 0.8, cal: 748 },
      { name: "сало", raw: 10, cooked: 10, coef: 1, verified: true, p: 2.4, f: 89, c: 0, cal: 811 },
    ]
  }
};

// Категорії для кожного прийому їжі
export const MEAL_LETTERS = {
  1: ["а", "б", "в"],
  2: ["г", "д", "е", "є"],
  3: ["ж", "з", "и"],
  4: ["і", "ї", "й"]
};

// Іконки категорій
export const CATEGORY_ICONS = {
  "а": "/icons/category-carbs.png",
  "б": "/icons/category-dairy.png",
  "в": "/icons/category-treats.png",
  "г": "/icons/category-carbs.png",
  "д": "/icons/category-protein.png",
  "е": "/icons/category-vegetables.png",
  "є": "/icons/category-fats.png",
  "ж": "/icons/category-dairy.png",
  "з": "/icons/category-fruits.png",
  "и": "/icons/category-nuts.png",
  "і": "/icons/category-protein.png",
  "ї": "/icons/category-vegetables.png",
  "й": "/icons/category-fats.png"
};

// Іконки прийомів їжі
export const MEAL_BADGE_ICONS = {
  1: "/icons/meal-badge-1.png",
  2: "/icons/meal-badge-2.png",
  3: "/icons/meal-badge-3.png",
  4: "/icons/meal-badge-4.png"
};

// Іконки профілів
export const PROFILE_ICONS = {
  "чоловік": "/icons/profile-male.png",
  "жінка": "/icons/profile-female.png"
};

// Стандартні порції для кожного продукту (в грамах сирого)
export const DEFAULT_PORTIONS = {
  // Вуглеводи (а, г)
  "бобові": 50,
  "картопля": 180,
  "кукурудза свіжа": 180,
  "рис нешліфований": 50,
  "будь-яка крупа": 50,
  "цільнозернове борошно": 50,
  "хлібці": 80,
  "цільнозерновий хліб": 85,
  "макарони т.с.": 50,
  "лаваш": 80,

  // Молочні Б (прийом 1) - 95 ккал
  "сир кисломолочний 0,2%": 160,
  "сири м'які/тверді/плавлені": 30,
  "сметана 15%": 30,
  "кефір 1%": 270,
  "йогурт несолодкий 1%": 250,
  "молоко 1%": 280,

  // Молочні Ж (прийом 3) - 150 ккал
  "сир кисломолочний 0,2% (ж)": 215,
  "сири м'які/тверді/плавлені (ж)": 42,
  "сметана 15% (ж)": 85,
  "кефір 1% (ж)": 365,
  "йогурт несолодкий 1% (ж)": 400,
  "молоко 1% (ж)": 365,

  // Вільний вибір (в)
  "будь-що": 115,
  "фрукти": 1150,
  "банани": 690,

  // Білки (д, і)
  "телятина": 160,
  "печінка": 160,
  "куряче філе": 190,
  "індиче філе": 190,
  "риба до 5% жиру": 190,
  "риба від 5% жиру": 130,
  "3 яйця": 150,
  "морепродукти": 225,

  // Овочі (е, ї)
  "овочі свіжі": 300,
  "овочі квашені": 300,
  "зелень": 300,
  "гриби": 300,

  // Жири (є, й)
  "олія лляна": 12,
  "будь-яка олія": 12,
  "авокадо": 65,
  "оливки": 80,
  "гірчиця": 28,
  "майонез": 15,
  "кетчуп": 42,
  "масло": 15,
  "сало": 10,

  // Фрукти (з)
  "фрукти та ягоди": 400,
  "банани/виноград/хурма": 240,

  // Горіхи (и)
  "грецькі горіхи": 20,
  "будь-які горіхи": 20,
  "насіння": 20
};

// Денні норми БЖВ
export const DAILY_TARGETS = {
  protein: 140,
  fat: 70,
  carbs: 235
};
