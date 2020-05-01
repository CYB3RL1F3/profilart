import passport from "passport";

import ResidentAdvisor from "../services/residentadvisor";
import Discogs from "../services/discogs";
import Contact from "../services/contact";
import Soundcloud from "../services/soundcloud";
import Validator from "../lib/validator";
import Database from "../lib/database";
import Profiles from "../services/profiles";
import All from "../services/all";
import Authenticator from "../authenticator";
import { err } from "../err";
import GraphQL from "../gql";
import { Express } from "express";
import { Services } from "./router.d";
import { RedisClient } from "redis";
import { Timeline } from '../services/timeline';
import Swagger from "swagger-ui-express";
const swaggerDocument = require('./swagger.json');

export class Router {
  services: Services;
  authenticator: Authenticator;
  app: Express;
  validator: Validator;
  profiles: Profiles;
  redisClient: RedisClient;
  timeline: Timeline;

  constructor(app: Express, redisClient: RedisClient) {
    this.app = app;
    this.redisClient = redisClient;
  }

  init() {
    this.initServices();
    this.initMiddlewares();
    this.initRoutes();
  }

  initServices() {
    const database = new Database();
    const residentAdvisor = new ResidentAdvisor(database);
    const discogs = new Discogs(database);
    const soundcloud = new Soundcloud(database);
    const contact = new Contact();
    const all: All = new All(database, residentAdvisor, discogs, soundcloud);
    const timeline = new Timeline(database);
    this.validator = new Validator();
    this.profiles = new Profiles(database);
    this.authenticator = new Authenticator(this.redisClient);

    // fill services dictionnary with different ones
    this.services = {
      public: {
        get: {
          charts: residentAdvisor.getCharts,
          events: residentAdvisor.getEvents,
          event: residentAdvisor.getEventById,
          infos: residentAdvisor.getInfos,
          tracks: soundcloud.getTracks,
          track: soundcloud.getTrack,
          playlist: soundcloud.getPlaylist,
          releases: discogs.getReleases,
          release: discogs.getReleaseById,
          posts: timeline.getPosts,
          all: all.get
        },
        post: {
          create: this.profiles.create,
          login: this.authenticate
        },
        patch: {
          password: this.profiles.forgottenPassword,
        },
        uidPost: { contact: contact.mail }
      },
      auth: {
        get: { profile: this.profiles.read },
        post: { 
          posts: timeline.addPost
        },
        patch: {
          profile: this.profiles.update,
          posts: timeline.editPost,
        },
        delete: { 
          profile: this.profiles.remove,
          "posts/:id": timeline.deletePost
        }
      }
    };
  }

  initMiddlewares() {
    passport.use(this.authenticator.getStrategy());
  }

  authenticate = async (p, body, req) => {
    try {
      return await this.authenticator.authenticate(
        body,
        req,
        this.profiles.login
      );
    } catch (e) {
      throw e;
    }
  };

  fail = (res, e) => {
    console.log(e);
    let err;
    try {
      err = JSON.parse(e.message);
      if (!err.code) err.code = 500;
    } catch(e) {
      err = {
        code: 500,
        message: "Uncaught fatal exception"
      }
    }
    console.log(err);
    res.status(err.code).send(
      JSON.stringify({
        error: {
          code: err.code,
          message: err.message
        }
      })
    );
  };

  forbidden = (req, res) => {
    this.fail(res, {
      message: JSON.stringify({
        code: 403,
        message: "authentication required"
      })
    });
  };

  initSwagger() {
    this.app.use('/swagger', Swagger.serve);
    
    this.app.use('/swagger', (req, res, next) => {
      try {
        res.setHeader("Content-Type", "text/html");
      } catch(e) {}
      return next();
    });
    this.app.get('/swagger', Swagger.setup(swaggerDocument));
  }

  initRoutes() {
    this.initGraphQL();
    this.initSwagger();
    this.initAuthRoutes();
    this.initPublicRoutes();
    this.init404();
  }

  run = async (req, query, service, dataProvider) => {
    let profile = null;
    if (
      service !== "login" &&
      service !== "create" &&
      service !== "forbidden" &&
      service !== "password"
    ) {
      try {
        let { uid } = req.params;
        if (!uid) throw err(400, "UID not provided");
        profile = await this.profiles.get(uid);
        if (!profile) throw err(400, "profile not found");
        this.validator.checkProfile(profile, service);
      } catch (e) {
        throw err(404, "profile not found");
      }
    }
    try {
      const response = await query(profile, dataProvider, req);
      return response;
    } catch (e) {
      throw e;
    }
  };

  initGraphQL() {
    const graphQl = new GraphQL(this);
    this.app.use("/graphql", graphQl.getMiddleware());
  }

  initPublicRoutes() {

    // POST requests
    Object.keys(this.services.public.post).forEach((service) => {
      console.log(`INIT [POST] /${service} `);
      this.app.post(`/${service}`, async (req, res) => {
        try {
          const query = this.services.public.post[service];
          const result = await this.run(req, query, service, req.body);
          res.status(200).send(JSON.stringify(result));
        } catch (e) {
          this.fail(res, e);
        }
      });
    });

    // PATCH requests
    Object.keys(this.services.public.patch).forEach((service) => {
      console.log(`INIT [PATCH] /${service} `);
      this.app.patch(`/${service}`, async (req, res) => {
        console.log('PASSSSS ', service);
        try {
          const query = this.services.public.patch[service];
          const result = await this.run(req, query, service, req.body);
          res.status(200).send(JSON.stringify(result));
        } catch (e) {
          this.fail(res, e);
        }
      });
    });

    // UID POST requests
    Object.keys(this.services.public.uidPost).forEach((service) => {
      console.log(`INIT [POST] /:uid/${service} `);
      this.app.post(`/:uid/${service}`, async (req, res) => {
        try {
          const query = this.services.public.uidPost[service];
          const result = await this.run(req, query, service, req.body);
          res.status(200).send(JSON.stringify(result));
        } catch (e) {
          this.fail(res, e);
        }
      });
    });

    // GET requests
    Object.keys(this.services.public.get).forEach((service) => {
      const serviceName = service === "all" ? "" : service;
      console.log(`INIT [GET] /:uid/${serviceName} `);
      this.app.get(`/:uid/${serviceName}`, async (req, res) => {
        try {
          const query = this.services.public.get[service];
          const result = await this.run(req, query, service, req.query);
          res.status(200).send(JSON.stringify(result));
        } catch (e) {
          this.fail(res, e);
        }
      });
    });
  }
  
  getAuthMiddleware = () =>
    passport.authenticate('jwt', {
      session: false,
      failureRedirect: "/forbidden"
    });

  initAuthRoutes() {
    const authMiddleware = this.getAuthMiddleware();
    this.app.get("/forbidden", this.forbidden);
    
    Object.keys(this.services.auth).forEach((method) => {
      const services = this.services.auth[method];
      Object.keys(services).forEach((service) => {
        let uri = `/${service}`;
        console.log(`INIT [${method.toUpperCase()}] ${uri}`)
        switch (method) {
          case "get":
            this.app.get(
              uri,
              authMiddleware,
              this.runAuthQuery(services[service], service, true)
            );
            break;
          case "post":
            this.app.post(
              uri,
              authMiddleware,
              this.runAuthQuery(services[service], service, false)
            );
            break;
          case "patch":
            this.app.patch(
              uri,
              authMiddleware,
              this.runAuthQuery(services[service], service, false)
            );
            break;
          case "delete":
            this.app.delete(
              uri,
              authMiddleware,
              this.runAuthQuery(services[service], service, true)
            );
            break;
        }
      });
    });
  }

  init404 = () => {
    this.app.get("*", (req, res) => {
      this.fail(res, err(404, "this endpoint does not exist"));
    });
  };

  runAuthQuery = (query, service, isGet) => async (req, res) => {
    try {
      const result = await this.run(
        req,
        query,
        service,
        isGet ? req.query : req.body
      );
      res.status(200).send(JSON.stringify(result));
    } catch (e) {
      this.fail(res, e);
    }
  };
}

export default Router;
