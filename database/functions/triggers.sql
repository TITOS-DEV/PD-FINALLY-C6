CREATE OR REPLACE FUNCTION rw_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


CREATE TRIGGER trg_rw_users_updated_at
BEFORE UPDATE ON rw_users
FOR EACH ROW
EXECUTE FUNCTION rw_set_updated_at();


CREATE TRIGGER trg_rw_channels_updated_at
BEFORE UPDATE ON rw_channels
FOR EACH ROW
EXECUTE FUNCTION rw_set_updated_at();


CREATE TRIGGER trg_rw_messages_updated_at
BEFORE UPDATE ON rw_messages
FOR EACH ROW
EXECUTE FUNCTION rw_set_updated_at();