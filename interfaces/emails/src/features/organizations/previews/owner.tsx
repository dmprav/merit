import { InvitationEmail } from "../invitation";
import { invitationFixtures } from "../invitation.fixtures";
import { EmailMessagesProvider } from "../messages";

const Preview = () => (
  <EmailMessagesProvider>
    <InvitationEmail {...invitationFixtures.owner} />
  </EmailMessagesProvider>
);

export default Preview;
