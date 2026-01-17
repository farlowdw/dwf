// the default export must be an object whose key values are
// 1-dimensional arrays comprised of objects that possess AT LEAST
// "id" and "title" property values; author, time, and link property values are optional
// property names of the default export object may be chosen at will
const bibItems = {
  endlessListing: [
    {
      id: 'GP1972',
      title: `Problems and Theorems in Analysis I`,
      subtitle: `Series, Integral Calculus, Theory of Functions`,
      author: 'George Polya and Gabor Szego',
      time: '1972',
      edition: '',
      link: 'https://www.amazon.com/dp/3540636404',
    },
    {
      id: 'WZ2016',
      title: `On Writing Well`,
      subtitle: `The Classic Guide to Writing Nonfiction`,
      author: 'William Zinsser',
      time: '2016',
      edition: '',
      link: 'https://www.amazon.com/dp/0060891548',
    },
    {
      id: 'DPV',
      title: `Algorithms`,
      author: 'Sanjoy Dasgupta, Christos Papadimitriou, and Umesh Vazirani',
      time: '2006',
      link: 'https://www.amazon.com/gp/product/0073523402',
    },
    {
      id: 'TC2022',
      title: 'Introduction to Algorithms - CLRS (4th Ed.)',
      author: 'Thomas Cormen, Charles Leiserson, Ronald Rivest, Clifford Stein',
      time: '2022',
      link: 'https://www.amazon.com/gp/product/026204630X',
    },
    {
      id: 'PB2017',
      title: `Forest Management and Planning`,
      author: 'Pete Bettinger et al.',
      time: '2017',
      link: 'https://www.amazon.com/Forest-Management-Planning-Peter-Bettinger/dp/0128094761',
    },
    {
      id: 'AM2020',
      title: 'SQL Cookbook: Query Solutions and Techniques for All SQL Users (2nd Ed.)',
      author: 'Anthony Molinaro and Robert de Graaf',
      time: '2020',
      link: 'https://www.amazon.com/gp/product/1492077445',
    },
    {
      id: 'AB2020',
      title: 'Learning SQL: Generate, Manipulate, and Retrieve Data',
      author: 'Alan Beaulieu',
      time: '2020',
      link: 'https://www.amazon.com/gp/product/1492057614',
    },
    {
      id: 'GL2016',
      title: `Data Analysis Using SQL and Excel`,
      author: 'Gordon Linoff',
      time: '2016',
      link: 'https://amazon.com/Data-Analysis-Using-SQL-Excel/dp/111902143X',
    },
    {
      id: 'bctci',
      title: `Beyond Cracking the Coding Interview`,
      author: 'Gayle Laakmann McDowell, Mike Mroczka, Aline Lerner, Nil Mamano',
      time: '2025',
      link: 'https://www.amazon.com/dp/195570600X',
    },
  ],
  math: [
    {
      id: 'KR2002',
      title: `Discrete Mathematics and Its Applications (5th Ed.)`,
      author: 'Kenneth R. Rosen',
      time: '2002',
      link: 'https://www.amazon.com/gp/product/0072424346',
    },
    {
      id: 'HE1990',
      title: `An Introduction to the History of Mathematics`,
      author: 'Howard Eves',
      time: '1990',
      link: 'https://www.amazon.com/dp/0030295580',
    },
    {
      id: 'GP2014',
      title: 'How to Solve It: A New Aspect of Mathematical Method (Reprint Edition)',
      author: 'George Polya',
      time: '2014',
      link: 'https://www.amazon.com/gp/product/069116407X',
    },
  ],
  onlineMaterials: [
    {
      id: 'HN',
      title: 'Hacker News (Homepage)',
      author: '',
      time: '',
      link: 'https://news.ycombinator.com/',
    },
    {
      id: 'AHS1987',
      title: `Polya, Problem Solving, and Education`,
      subtitle: ``,
      author: 'Alan H. Schoenfeld',
      time: '1987',
      edition: '',
      link: 'https://www.researchgate.net/publication/264913424_Polya_Problem_Solving_and_Education',
    },
    {
      id: 'fangprepSubstack',
      title: 'Fangprep - Big Tech Interview Prep',
      author: 'Daniel Habib',
      time: '',
      link: 'https://fangprep.substack.com/archive?sort=top',
    },
  ],
}

export default bibItems;
