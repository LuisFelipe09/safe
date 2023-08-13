import express from 'express';
import {main} from './safe'
import cors from 'cors'; // Importa el paquete cors

const app = express();
const port = 4000;

// Configura CORS
app.use(cors({
    origin: '*',
    methods: ['GET','POST','DELETE','UPDATE','PUT','PATCH']
}));

app.use(express.json());


app.get('/', async (req, res) => {
  res.send('Hello, TypeScript and Express!');
});

app.post('/mint', async (req , res) => {
    console.log(req.body);
    const {metadata, wallet} = req.body;
    console.log(`metadata ${ metadata }`);
    console.log(`wallet ${ wallet }`);
    const response = await main(metadata, wallet);

    res.send({tx : response});
});

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
