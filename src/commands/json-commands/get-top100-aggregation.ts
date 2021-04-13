export default function getTop100Aggregation($match: object) {
  return [
    {
      $match: $match,
    },
    {
      $group: {
        _id: {
          userName: '$userName',
        },
        score: {
          $max: '$score',
        },
        data: {
          $first: '$$ROOT',
        },
      },
    },
    {
      $sort: {
        score: -1,
      },
    },
    {
      $limit: 100,
    },
  ];
}
