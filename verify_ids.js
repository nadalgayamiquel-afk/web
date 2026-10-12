const ids_from_db = [
  '4f25efc4-8b6c-4dd8-8799-a805aaa8b66d',
  '029a3c4d-e44a-4ef1-9d95-5715033dec42',
  '08dee8b5-d0e0-4358-86e7-5124ece580ca',
  '7bd5dc45-ca0d-4dce-9f59-8c7a3837fbcc',
  '4d3ad31c-f7cd-4de8-a199-af723618bff4', // wait, is this Roger?
  '6f10e534-9974-4c05-99b0-4b055258374a',
  'aec4e6e1-5a47-4b55-b23a-715eaac292a2',
  'b77c80d6-486a-4276-a20a-f33985249e8f',
  '82d3987f-9ebb-4164-8fe5-b7e68a08e18b',
  'b6877a25-e6de-48f3-aab3-1ae48a53e317',
  '32a88998-f40c-43c9-900d-d1aecf3244b5',
  '33182eb2-bed8-4320-9bd5-9c1fbf63c260',
  '71ba8914-0d2d-47fe-a078-5aba08bf8a26',
  'ba0f3680-2107-4718-b117-90879fb52f4b',
  '8a894b48-7fde-406b-9cdd-8dc7536b1648',
  '94dc8b4e-3db5-49b5-981a-5222e0a136a2',
  '44980484-06d0-4eba-9896-417d29438e91',
  '45d23990-6071-4c56-b997-1f5a4efbda72',
  'd0444862-4bb1-4d9e-81d6-2eae200a036c', // Roger Munells
  '10e6eb1c-6377-47c6-93dd-2bd583a4661b'
];

const target_ids = {
  'ROGER PEÑA': '8a71c6f6-34b2-42f6-a5e6-4f89b5512ea6',
  'OUSSAMA BOUKIR': '44a17d58-563b-41a5-811f-58ee1365866d',
  'BILAL ACHHIBA': 'e218da66-f670-4e19-8812-a5d9ba301de2',
  'ALEX IGLESIAS': 'c10999d2-2293-4191-bdeb-2ea4c72aa63a',
  'ROGER MUNELLS': 'd0444862-4bb1-4d9e-81d6-2eae200a036c'
};

for (const [name, id] of Object.entries(target_ids)) {
  if (ids_from_db.includes(id)) {
    console.log(`${name} IS in the DB!`);
  } else {
    console.log(`${name} is NOT in the DB!`);
  }
}
