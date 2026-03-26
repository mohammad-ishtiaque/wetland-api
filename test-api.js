import axios from 'axios';

axios.post('http://localhost:5000/api/v1/evaluations/calculate', {
    lat: 42.1, lon: -93.2, observationDate: '2023-08-01'
}).then(res => console.log(JSON.stringify(res.data, null, 2)))
    .catch(e => console.error(e.response?.data || e.message));
