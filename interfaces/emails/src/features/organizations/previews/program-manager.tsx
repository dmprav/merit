import { InvitationEmail } from "../invitation";
import { invitationFixtures } from "../invitation.fixtures";
import { EmailMessagesProvider } from "../messages";

const Preview = () => (
  <EmailMessagesProvider>
    <InvitationEmail {...invitationFixtures.programManager} />
  </EmailMessagesProvider>
);

export default Preview;
