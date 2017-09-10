export const config = {
    api: {
        residentAdvisor: {
            dj: 'https://www.residentadvisor.net/api/dj.asmx',
            events: 'https://www.residentadvisor.net/api/events.asmx'
        },
        discogs: 'https://api.discogs.com/'
    },
    db: {
        address: process.env.DB // || 'mongodb://localhost:27017/profilart'
    }
};

export default config;
