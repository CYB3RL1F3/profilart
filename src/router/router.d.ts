import { ChartsQueryArgs, ChartsModel } from "model/charts";
import {
  ProfileModel,
  AuthenticatedProfileResponseModel,
  UpdateProfileArgs,
  Credentials,
  DeletedStatus
} from "model/profile";
import { EventArgs, EventModel, EventByIdArgs } from "model/events";
import { InfosModel } from "model/infos";
import { Track, PlaylistArgs, PlaylistModel } from "model/playlist";
import { Release, ReleasesByIdArgs } from "model/releases";
import { AllServiceResults } from "model/all";
import { Status, ContactParams } from "services/contact";
import { TracksArgs } from "model/tracks";

export interface Services {
  public: {
    get: {
      charts: (
        profile: ProfileModel,
        args?: ChartsQueryArgs
      ) => Promise<ChartsModel[]>;
      events: (profile: ProfileModel, args: EventArgs) => Promise<EventModel[]>;
      event: (
        profile: ProfileModel,
        args: EventByIdArgs
      ) => Promise<EventModel>;
      infos: (profile: ProfileModel) => Promise<InfosModel>;
      tracks: (profile: ProfileModel) => Promise<Track[]>;
      track: (profile: ProfileModel, args: TracksArgs) => Promise<Track>;
      playlist: (
        profile: ProfileModel,
        args: PlaylistArgs
      ) => Promise<PlaylistModel>;
      releases: (profile: ProfileModel) => Promise<Release[]>;
      release: (
        profile: ProfileModel,
        args: ReleasesByIdArgs
      ) => Promise<Release>;
      all: (profile: ProfileModel) => Promise<AllServiceResults>;
    };
    post: {
      create: (
        args: any,
        profile: ProfileModel
      ) => Promise<AuthenticatedProfileResponseModel>;
      login: (p, body, req) => any;
    };
    uidPost: {
      contact: (profile: ProfileModel, args: ContactParams) => Promise<Status>;
    };
  };
  auth: {
    get: {
      profile: (profile: ProfileModel) => AuthenticatedProfileResponseModel;
    };
    patch: {
      profile: (
        profile: ProfileModel,
        args: UpdateProfileArgs
      ) => Promise<AuthenticatedProfileResponseModel>;
      password: (args, credentials: Credentials) => Promise<Status>;
    };
    delete: { profile: (profile: ProfileModel) => Promise<DeletedStatus> };
  };
}