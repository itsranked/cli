export default function getTop100Aggregation($match: object) {
  return [
    {
      $match: $match,
    },
    {
      $sort: {
        score: -1,
      },
    },
    {
      $group: {
        _id: {
          userName: '$userName',
        },
        data: {
          $first: '$$ROOT',
        },
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [ '$data' ]
        }
      },
    },
    {
      $sort: {
        'score': -1,
      },
    },
    {
      $limit: 100,
    },
  ];
}
